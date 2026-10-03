import { Injectable } from '@nestjs/common';
import { dbDate, fromDbDate } from '@fernleaf/domain';
import type {
  AdminDashboardDto,
  DashboardDto,
  DispatchDashboardDto,
  DriverDashboardDto,
  KitchenDashboardDto,
  Ratio,
} from '@fernleaf/shared';
import { DateTime } from 'luxon';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { PricingService } from '../catalogue/pricing.service';
import { CutoffService } from '../cutoff/cutoff.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { KitchenService } from '../kitchen/kitchen.service';

const COMMITTED = ['CONFIRMED', 'DELIVERED'] as const;

export const ratio = (num: number, den: number): Ratio => ({ num, den, pct: den === 0 ? null : Math.round((num / den) * 1000) / 10 });

/**
 * Role dashboards (PRD §8). Each figure is computed by the same services the boards use (kitchen
 * board, dispatch board, billing overview, tier grid), so a dashboard never disagrees with the
 * screen it links to. Definitions: PRD §8, copied into the README.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly cutoff: CutoffService,
    private readonly kitchen: KitchenService,
    private readonly dispatch: DispatchService,
    private readonly billing: BillingService,
    private readonly pricing: PricingService,
  ) {}

  async forUser(user: AuthUser): Promise<DashboardDto> {
    await this.cutoff.ensureProcessed();
    const today = this.clock.today();
    const base = { generatedAt: this.clock.now().toISOString(), today };
    switch (user.dashboard) {
      case 'KITCHEN':
        return { ...base, ...(await this.kitchenFigures(today)) };
      case 'DISPATCH':
        return { ...base, ...(await this.dispatchFigures(today)) };
      case 'DRIVER':
        return { ...base, ...(await this.driverFigures(user)) };
      default:
        return { ...base, ...(await this.adminFigures(today)) };
    }
  }

  private addDays(date: string, days: number): string {
    return DateTime.fromISO(date, { zone: 'utc' }).plus({ days }).toISODate()!;
  }

  // ───────────── Admin (A1–A7) ─────────────

  private async adminFigures(today: string): Promise<AdminDashboardDto> {
    const day = dbDate(today);
    const from14 = this.addDays(today, -13);
    const [committed, boxes, voided, board, drops, cutoffDays, perDay, companies, oldest, tiers, gaps] = await Promise.all([
      this.prisma.order.aggregate({ where: { deliveryDate: day, status: { in: [...COMMITTED] } }, _count: { _all: true }, _sum: { totalCents: true } }),
      this.prisma.orderLine.aggregate({ where: { order: { deliveryDate: day, status: { in: [...COMMITTED] } } }, _sum: { quantity: true } }),
      this.prisma.order.count({ where: { deliveryDate: day, status: { in: ['CANCELLED', 'REJECTED'] } } }),
      this.kitchen.board(today),
      this.dispatch.board(today),
      this.cutoff.listDays(today, this.addDays(today, 21)),
      this.prisma.order.groupBy({
        by: ['deliveryDate'],
        where: { deliveryDate: { gte: dbDate(from14), lte: day }, status: { in: [...COMMITTED] } },
        _sum: { totalCents: true },
        _count: { _all: true },
      }),
      this.billing.companies(),
      this.prisma.invoice.findFirst({ where: { status: 'ISSUED' }, orderBy: { issuedAt: 'asc' }, select: { issuedAt: true } }),
      this.pricing.tiers(),
      this.prisma.company.findMany({ where: { OR: [{ ownerEmployeeId: null }, { defaultDriverId: null }] }, select: { id: true, name: true, ownerEmployeeId: true, defaultDriverId: true } }),
    ]);

    // A4: the nearest delivery date whose cut-off is still ahead.
    const next = cutoffDays.find((d) => d.state === 'OPEN');
    const placedCents = next
      ? ((await this.prisma.order.aggregate({ where: { deliveryDate: dbDate(next.date), status: 'PLACED' }, _sum: { totalCents: true } }))._sum.totalCents ?? 0)
      : 0;

    const byDay = new Map(perDay.map((r) => [fromDbDate(r.deliveryDate), r]));
    const delivered = drops.drops.filter((d) => d.stage === 'DELIVERED');
    const unbilled = companies
      .map((c) => ({ companyId: c.id, name: c.name, cents: c.unbilledCents + c.pendingAdjustmentCents }))
      .sort((a, b) => b.cents - a.cents);

    return {
      kind: 'ADMIN',
      A1: { orders: committed._count._all, boxes: boxes._sum.quantity ?? 0, bookedCents: committed._sum.totalCents ?? 0, cancelledOrRejected: voided },
      A2: { units: ratio(board.units.filter((u) => u.status === 'DONE').length, board.units.length), lateUnits: board.units.filter((u) => u.risk === 'LATE').length },
      A3: {
        delivered: ratio(delivered.length, drops.drops.length),
        onTime: ratio(delivered.filter((d) => d.deliveredOnTime).length, delivered.length),
      },
      A4: next ? { date: next.date, cutoffAt: next.cutoffAt, placed: next.counts.placed, placedCents, drafts: next.counts.draft } : null,
      A5: Array.from({ length: 14 }, (_, i) => {
        const date = this.addDays(from14, i);
        const row = byDay.get(date);
        return { date, bookedCents: row?._sum.totalCents ?? 0, orders: row?._count._all ?? 0 };
      }),
      A6: {
        unbilledCents: unbilled.reduce((s, c) => s + c.cents, 0),
        topUnbilled: unbilled.filter((c) => c.cents !== 0).slice(0, 5),
        outstandingCents: companies.reduce((s, c) => s + c.outstandingCents, 0),
        outstandingInvoices: companies.reduce((s, c) => s + c.outstandingInvoices, 0),
        oldestOutstanding: oldest ? DateTime.fromJSDate(oldest.issuedAt, { zone: this.clock.zone }).toISODate() : null,
      },
      A7: {
        missingPrices: tiers.map((t) => ({ tierId: t.id, tier: t.name, dishes: t.missingDishes, options: t.missingOptions })),
        companiesWithoutOwner: gaps.filter((c) => !c.ownerEmployeeId).map(({ id, name }) => ({ id, name })),
        companiesWithoutDriver: gaps.filter((c) => !c.defaultDriverId).map(({ id, name }) => ({ id, name })),
      },
    };
  }

  // ───────────── Kitchen (K1–K6) ─────────────

  private async kitchenFigures(today: string): Promise<KitchenDashboardDto> {
    const tomorrow = this.addDays(today, 1);
    const [board, summary, next, tomorrowCutoff, placedTomorrow] = await Promise.all([
      this.kitchen.board(today),
      this.kitchen.summary(today),
      this.kitchen.board(tomorrow),
      this.cutoff.cutoffFor(tomorrow),
      this.prisma.order.count({ where: { deliveryDate: dbDate(tomorrow), status: 'PLACED' } }),
    ]);
    const open = board.units.filter((u) => u.status !== 'DONE');
    const slots = new Map<string, { units: number; boxes: number }>();
    for (const u of open) {
      const s = slots.get(u.plannedKitchenReadyAt) ?? { units: 0, boxes: 0 };
      slots.set(u.plannedKitchenReadyAt, { units: s.units + 1, boxes: s.boxes + u.quantity });
    }
    const allergenUnits = new Map<string, number>();
    for (const u of board.units) for (const a of u.allergens) allergenUnits.set(a, (allergenUnits.get(a) ?? 0) + 1);
    const late = open.filter((u) => u.risk === 'LATE');
    const atRisk = open.filter((u) => u.risk === 'AT_RISK');
    const boxesOf = (units: { quantity: number }[]) => units.reduce((s, u) => s + u.quantity, 0);

    return {
      kind: 'KITCHEN',
      K1: board.stations
        .filter((s) => s.units > 0)
        .map((s) => ({ station: s.name, units: s.units, boxes: s.boxes, notStarted: s.notStarted, inProgress: s.inProgress, done: s.done })),
      K2: [...slots.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, 5)
        .map(([readyBy, v]) => ({ readyBy, ...v })),
      K3: { late: late.length, atRisk: atRisk.length, lateBoxes: boxesOf(late), atRiskBoxes: boxesOf(atRisk) },
      K4: summary.dishes.slice(0, 12).map((d) => ({ dish: d.dishName, station: d.stationName, boxes: d.boxes, doneBoxes: d.doneBoxes, topCombination: d.combinations[0]?.label ?? '' })),
      K5: {
        allergens: [...allergenUnits.entries()].map(([name, units]) => ({ name, units })).sort((a, b) => b.units - a.units),
        conflicts: board.units.filter((u) => u.allergyConflicts.length > 0).length,
      },
      K6: {
        date: tomorrow,
        provisional: !tomorrowCutoff.locked,
        stations: next.stations.filter((s) => s.units > 0).map((s) => ({ station: s.name, units: s.units, boxes: s.boxes })),
        placedOrders: placedTomorrow,
      },
    };
  }

  // ───────────── Dispatch (D1–D5) ─────────────

  private async dispatchFigures(today: string): Promise<DispatchDashboardDto> {
    const from7 = this.addDays(today, -6);
    const [board, history] = await Promise.all([
      this.dispatch.board(today),
      this.prisma.drop.groupBy({
        by: ['deliveryDate', 'deliveredOnTime'],
        where: { deliveryDate: { gte: dbDate(from7), lte: dbDate(today) }, stage: 'DELIVERED' },
        _count: { _all: true },
      }),
    ]);
    const drops = board.drops;
    const notLeft = drops.filter((d) => d.stage === 'PENDING' || d.stage === 'DISPATCH_READY');
    const drivers = new Map<string, DispatchDashboardDto['D4'][number]>();
    for (const d of drops) {
      const name = d.driver?.name ?? 'Unassigned';
      const row = drivers.get(name) ?? { driver: name, drops: 0, remaining: 0, boxes: 0, nextDeparture: null };
      row.drops++;
      row.boxes += d.boxes;
      if (d.stage !== 'DELIVERED') row.remaining++;
      if ((d.stage === 'PENDING' || d.stage === 'DISPATCH_READY') && (!row.nextDeparture || d.plannedDispatchReadyAt < row.nextDeparture)) row.nextDeparture = d.plannedDispatchReadyAt;
      drivers.set(name, row);
    }
    return {
      kind: 'DISPATCH',
      D1: {
        waitingForKitchen: drops.filter((d) => d.stage === 'PENDING' && d.readyOrders < d.totalOrders).length,
        readyToDispatch: drops.filter((d) => d.stage === 'PENDING' && d.readyOrders === d.totalOrders).length,
        dispatchReady: drops.filter((d) => d.stage === 'DISPATCH_READY').length,
        outForDelivery: drops.filter((d) => d.stage === 'OUT_FOR_DELIVERY').length,
        delivered: drops.filter((d) => d.stage === 'DELIVERED').length,
      },
      D2: {
        count: notLeft.filter((d) => !d.driver).length,
        drops: notLeft.filter((d) => !d.driver).map((d) => ({ id: d.id, time: d.deliveryTime, company: d.company.name })),
      },
      D3: {
        late: notLeft.filter((d) => d.risk === 'LATE').length,
        atRisk: notLeft.filter((d) => d.risk === 'AT_RISK').length,
        deliveredLate: drops.filter((d) => d.deliveredOnTime === false).length,
      },
      D4: [...drivers.values()].sort((a, b) => (a.driver === 'Unassigned' ? 1 : b.driver === 'Unassigned' ? -1 : a.driver.localeCompare(b.driver))),
      D5: Array.from({ length: 7 }, (_, i) => {
        const date = this.addDays(from7, i);
        const rows = history.filter((h) => fromDbDate(h.deliveryDate) === date);
        const total = rows.reduce((s, r) => s + r._count._all, 0);
        return { date, onTime: ratio(rows.filter((r) => r.deliveredOnTime).reduce((s, r) => s + r._count._all, 0), total) };
      }),
    };
  }

  // ───────────── Driver (R1–R2) ─────────────

  private async driverFigures(user: AuthUser): Promise<DriverDashboardDto> {
    const day = await this.dispatch.driverDay(user);
    const delivered = day.drops.filter((d) => d.stage === 'DELIVERED');
    const next = day.drops.find((d) => d.stage !== 'DELIVERED') ?? null;
    return {
      kind: 'DRIVER',
      R1: {
        total: day.drops.length,
        remaining: day.drops.length - delivered.length,
        delivered: delivered.length,
        next: next
          ? {
              id: next.id,
              time: next.deliveryTime,
              company: next.company.name,
              address: next.address.text,
              boxes: next.boxes,
              instructions: [next.address.notes, next.instructions].filter(Boolean).join(' · '),
              stage: next.stage,
            }
          : null,
      },
      R2: { onTime: ratio(delivered.filter((d) => d.deliveredOnTime).length, delivered.length) },
    };
  }
}
