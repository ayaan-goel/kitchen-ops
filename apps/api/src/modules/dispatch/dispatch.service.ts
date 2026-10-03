import { Injectable } from '@nestjs/common';
import { type CalendarDate, dbDate, dropRisk, fromDbDate } from '@fernleaf/domain';
import {
  type AssignableDriverDto,
  type DeliverDropInput,
  type DispatchBoardDto,
  type DriverDayDto,
  type DropDto,
  minutesToTime,
} from '@fernleaf/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { NotFound } from '../../common/errors/domain-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { CutoffService } from '../cutoff/cutoff.service';
import { formatAddress } from '../ordering/order-pipeline.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { assertImage, FileStore } from '../files/file-store';
import { DropService } from './drop.service';

const DROP_INCLUDE = {
  company: { select: { id: true, name: true, driverInstructions: true } },
  address: { select: { id: true, label: true, line1: true, line2: true, city: true, postalCode: true, deliveryNotes: true } },
  driver: { select: { id: true, name: true, phone: true } },
  orders: {
    where: { status: { in: ['CONFIRMED', 'DELIVERED'] } },
    orderBy: { number: 'asc' },
    select: {
      id: true,
      number: true,
      status: true,
      plannedKitchenReadyAt: true,
      plannedDispatchReadyAt: true,
      kitchenReadyAt: true,
      kitchenForced: true,
      employee: { select: { name: true } },
      lines: { select: { quantity: true } },
    },
  },
} satisfies Prisma.DropInclude;

type DropRow = Prisma.DropGetPayload<{ include: typeof DROP_INCLUDE }>;

/** Dispatch board and driver day (DSP-01…09). Transitions themselves live in `DropService`. */
@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly settings: PlatformSettingsService,
    private readonly cutoff: CutoffService,
    private readonly drops: DropService,
    private readonly files: FileStore,
  ) {}

  async board(date: CalendarDate): Promise<DispatchBoardDto> {
    await this.cutoff.ensureProcessed();
    const { settings } = await this.settings.get();
    const now = this.clock.now();
    const rows = await this.prisma.drop.findMany({
      where: { deliveryDate: dbDate(date) },
      include: DROP_INCLUDE,
      orderBy: [{ deliveryAt: 'asc' }, { createdAt: 'asc' }],
    });
    const drops = await this.toDtos(rows.filter((d) => d.orders.length > 0), now, settings.atRiskMinutes);
    return { date, now: now.toISOString(), atRiskMinutes: settings.atRiskMinutes, drops };
  }

  async drop(id: string): Promise<DropDto> {
    const { settings } = await this.settings.get();
    const row = await this.prisma.drop.findUnique({ where: { id }, include: DROP_INCLUDE });
    if (!row) throw new NotFound('Drop not found');
    return (await this.toDtos([row], this.clock.now(), settings.atRiskMinutes))[0]!;
  }

  /** Anyone whose role grants `deliveries.own` can drive (never a role-name check), with their load that day. */
  async drivers(date: CalendarDate): Promise<AssignableDriverDto[]> {
    const [staff, load] = await Promise.all([
      this.prisma.staffUser.findMany({
        where: { isActive: true, role: { permissions: { has: 'deliveries.own' } } },
        select: { id: true, name: true, phone: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.drop.groupBy({
        by: ['driverId', 'stage'],
        where: { deliveryDate: dbDate(date), driverId: { not: null }, orders: { some: { status: { in: ['CONFIRMED', 'DELIVERED'] } } } },
        _count: { _all: true },
      }),
    ]);
    return staff.map((s) => {
      const mine = load.filter((l) => l.driverId === s.id);
      return {
        ...s,
        dropsOnDate: mine.reduce((n, l) => n + l._count._all, 0),
        openDrops: mine.filter((l) => l.stage !== 'DELIVERED').reduce((n, l) => n + l._count._all, 0),
      };
    });
  }

  // ─── dispatch actions (dispatch.manage) ───

  assignDriver(id: string, driverId: string | null, actor: AuthUser): Promise<DropDto> {
    return this.transition(id, (tx, now) => this.drops.assignDriver(tx, id, driverId, actor.id, now));
  }

  markDispatchReady(id: string, actor: AuthUser): Promise<DropDto> {
    return this.transition(id, (tx, now) => this.drops.markDispatchReady(tx, id, actor.id, now));
  }

  markOutForDelivery(id: string, actor: AuthUser): Promise<DropDto> {
    return this.transition(id, (tx, now) => this.drops.markOutForDelivery(tx, id, actor.id, now));
  }

  /** Recorded on the driver's behalf (A-28). */
  async deliver(id: string, input: DeliverDropInput, actor: AuthUser): Promise<DropDto> {
    const { settings } = await this.settings.get();
    return this.transition(id, (tx, now) =>
      this.drops.deliver(tx, id, actor.id, now, { ...input, graceMinutes: settings.onTimeGraceMinutes }),
    );
  }

  // ─── driver (deliveries.own): own drops, kitchen-today only; anything else is a 404 ───

  async driverDay(driver: AuthUser): Promise<DriverDayDto> {
    await this.cutoff.ensureProcessed();
    const { settings } = await this.settings.get();
    const now = this.clock.now();
    const today = this.clock.today();
    const rows = await this.prisma.drop.findMany({
      where: { deliveryDate: dbDate(today), driverId: driver.id },
      include: DROP_INCLUDE,
      orderBy: [{ deliveryAt: 'asc' }, { createdAt: 'asc' }],
    });
    const drops = await this.toDtos(rows.filter((d) => d.orders.length > 0), now, settings.atRiskMinutes);
    return { date: today, now: now.toISOString(), drops };
  }

  async driverPickedUp(id: string, driver: AuthUser): Promise<DropDto> {
    await this.assertOwnToday(id, driver);
    return this.transition(id, (tx, now) => this.drops.markOutForDelivery(tx, id, driver.id, now, driver.id));
  }

  async driverDelivered(id: string, input: DeliverDropInput, driver: AuthUser): Promise<DropDto> {
    await this.assertOwnToday(id, driver);
    const { settings } = await this.settings.get();
    return this.transition(id, (tx, now) =>
      this.drops.deliver(tx, id, driver.id, now, { ...input, graceMinutes: settings.onTimeGraceMinutes }, driver.id),
    );
  }

  async driverPhoto(id: string, data: Buffer | undefined, driver: AuthUser): Promise<{ photoId: string }> {
    await this.assertOwnToday(id, driver);
    const mimeType = assertImage(data);
    const file = await this.files.put({ kind: 'DELIVERY_PHOTO', mimeType, data: data!, createdById: driver.id });
    return { photoId: file.id };
  }

  private async assertOwnToday(id: string, driver: AuthUser): Promise<void> {
    const drop = await this.prisma.drop.findFirst({
      where: { id, driverId: driver.id, deliveryDate: dbDate(this.clock.today()) },
      select: { id: true },
    });
    if (!drop) throw new NotFound('Drop not found');
  }

  private async transition(id: string, step: (tx: Prisma.TransactionClient, now: Date) => Promise<void>): Promise<DropDto> {
    await this.cutoff.ensureProcessed();
    const now = this.clock.now();
    await this.prisma.$transaction((tx) => step(tx, now));
    return this.drop(id);
  }

  private async toDtos(rows: DropRow[], now: Date, atRiskMinutes: number): Promise<DropDto[]> {
    const deliveredByIds = [...new Set(rows.map((r) => r.deliveredById).filter((x): x is string => !!x))];
    const deliverers = deliveredByIds.length
      ? await this.prisma.staffUser.findMany({ where: { id: { in: deliveredByIds } }, select: { id: true, name: true } })
      : [];
    const names = new Map(deliverers.map((s) => [s.id, s.name]));

    return rows.map((d) => {
      const planned = d.orders.reduce<Date>((min, o) => (o.plannedDispatchReadyAt < min ? o.plannedDispatchReadyAt : min), d.deliveryAt);
      return {
        id: d.id,
        deliveryDate: fromDbDate(d.deliveryDate),
        deliveryTime: minutesToTime(d.deliveryTime),
        deliveryAt: d.deliveryAt.toISOString(),
        stage: d.stage,
        company: { id: d.company.id, name: d.company.name },
        address: { id: d.address.id, label: d.address.label, text: formatAddress(d.address), notes: d.address.deliveryNotes },
        instructions: d.company.driverInstructions,
        driver: d.driver,
        totalOrders: d.orders.length,
        readyOrders: d.orders.filter((o) => o.kitchenReadyAt).length,
        boxes: d.orders.reduce((n, o) => n + o.lines.reduce((m, l) => m + l.quantity, 0), 0),
        plannedDispatchReadyAt: planned.toISOString(),
        risk: dropRisk(d.stage, planned, now, atRiskMinutes),
        dispatchReadyAt: d.dispatchReadyAt?.toISOString() ?? null,
        outForDeliveryAt: d.outForDeliveryAt?.toISOString() ?? null,
        deliveredAt: d.deliveredAt?.toISOString() ?? null,
        deliveredOnTime: d.deliveredOnTime,
        deliveredBy: d.deliveredById ? (names.get(d.deliveredById) ?? null) : null,
        deliveryNote: d.deliveryNote,
        photoId: d.photoId,
        orders: d.orders.map((o) => ({
          id: o.id,
          number: o.number,
          employeeName: o.employee.name,
          boxes: o.lines.reduce((m, l) => m + l.quantity, 0),
          status: o.status as 'CONFIRMED' | 'DELIVERED',
          plannedKitchenReadyAt: o.plannedKitchenReadyAt.toISOString(),
          kitchenReadyAt: o.kitchenReadyAt?.toISOString() ?? null,
          kitchenForced: o.kitchenForced,
        })),
      };
    });
  }
}
