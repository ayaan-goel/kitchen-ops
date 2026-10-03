import { Injectable } from '@nestjs/common';
import { type CalendarDate, dbDate, unionIds, unitRisk } from '@fernleaf/domain';
import {
  type KitchenBoardDto,
  type KitchenStationSummaryDto,
  type KitchenSummaryDto,
  type KitchenUnitDto,
  minutesToTime,
  type UnitActionResultDto,
  type UnitStatus,
} from '@fernleaf/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { NotFound, RuleViolation, StateConflict } from '../../common/errors/domain-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { CutoffService } from '../cutoff/cutoff.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';

type Tx = Prisma.TransactionClient;
const UNASSIGNED = 'Unassigned';

const UNIT_INCLUDE = {
  selections: { select: { optionId: true } },
  orderLine: {
    select: {
      dishId: true,
      dishName: true,
      dishTemperature: true,
      dish: { select: { stationId: true } },
      order: {
        select: {
          id: true,
          number: true,
          deliveryTime: true,
          plannedKitchenReadyAt: true,
          company: { select: { name: true } },
          employee: { select: { name: true, allergens: { select: { allergenId: true } } } },
        },
      },
    },
  },
} satisfies Prisma.OrderLineCombinationInclude;

function unitStatus(startedAt: Date | null, doneAt: Date | null): UnitStatus {
  return doneAt ? 'DONE' : startedAt ? 'IN_PROGRESS' : 'NOT_STARTED';
}

/**
 * Kitchen board (KIT-01…12). A prep unit is one combination of one line of a confirmed order
 * (ADR-010). Unit changes take a row lock on the parent order, so concurrent cooks are
 * serialised per order: no double start/finish, and kitchen-ready is set exactly once (NFR-03).
 */
@Injectable()
export class KitchenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly settings: PlatformSettingsService,
    private readonly cutoff: CutoffService,
  ) {}

  async board(date: CalendarDate): Promise<KitchenBoardDto> {
    await this.cutoff.ensureProcessed();
    const { settings } = await this.settings.get();
    const now = this.clock.now();

    const [units, stations, staff] = await Promise.all([
      this.prisma.orderLineCombination.findMany({
        where: { orderLine: { order: { deliveryDate: dbDate(date), status: { in: ['CONFIRMED', 'DELIVERED'] } } } },
        include: UNIT_INCLUDE,
      }),
      this.prisma.kitchenStation.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
      this.prisma.staffUser.findMany({ select: { id: true, name: true } }),
    ]);

    // Allergens of a unit = dish allergens ∪ chosen options' allergens (live catalogue data: safety first).
    const dishIds = [...new Set(units.map((u) => u.orderLine.dishId))];
    const optionIds = [...new Set(units.flatMap((u) => u.selections.map((s) => s.optionId)))];
    const [dishAllergens, optionAllergens, allergens] = await Promise.all([
      this.prisma.dishAllergen.findMany({ where: { dishId: { in: dishIds } } }),
      this.prisma.optionAllergen.findMany({ where: { optionId: { in: optionIds } } }),
      this.prisma.allergen.findMany({ select: { id: true, name: true } }),
    ]);
    const byDish = new Map<string, string[]>();
    for (const a of dishAllergens) byDish.set(a.dishId, [...(byDish.get(a.dishId) ?? []), a.allergenId]);
    const byOption = new Map<string, string[]>();
    for (const a of optionAllergens) byOption.set(a.optionId, [...(byOption.get(a.optionId) ?? []), a.allergenId]);
    const allergenName = new Map(allergens.map((a) => [a.id, a.name]));
    const staffName = new Map(staff.map((s) => [s.id, s.name]));

    const dtos: KitchenUnitDto[] = units.map((u) => {
      const order = u.orderLine.order;
      const ids = unionIds(byDish.get(u.orderLine.dishId) ?? [], ...u.selections.map((s) => byOption.get(s.optionId) ?? []));
      const declared = new Set(order.employee.allergens.map((a) => a.allergenId));
      return {
        id: u.id,
        orderId: order.id,
        orderNumber: order.number,
        companyName: order.company.name,
        employeeName: order.employee.name,
        dishName: u.orderLine.dishName,
        temperature: u.orderLine.dishTemperature,
        label: u.label,
        quantity: u.quantity,
        stationId: u.orderLine.dish.stationId,
        allergens: ids.map((id) => allergenName.get(id) ?? id),
        allergyConflicts: ids.filter((id) => declared.has(id)).map((id) => allergenName.get(id) ?? id),
        deliveryTime: minutesToTime(order.deliveryTime),
        plannedKitchenReadyAt: order.plannedKitchenReadyAt.toISOString(),
        startedAt: u.kitchenStartedAt?.toISOString() ?? null,
        startedBy: u.kitchenStartedById ? (staffName.get(u.kitchenStartedById) ?? null) : null,
        doneAt: u.kitchenDoneAt?.toISOString() ?? null,
        doneBy: u.kitchenDoneById ? (staffName.get(u.kitchenDoneById) ?? null) : null,
        status: unitStatus(u.kitchenStartedAt, u.kitchenDoneAt),
        risk: unitRisk(u.kitchenDoneAt, order.plannedKitchenReadyAt, now, settings.atRiskMinutes),
      };
    });
    dtos.sort(
      (a, b) =>
        a.plannedKitchenReadyAt.localeCompare(b.plannedKitchenReadyAt) || a.dishName.localeCompare(b.dishName) || a.orderNumber - b.orderNumber,
    );

    const summarise = (id: string | null, name: string): KitchenStationSummaryDto => {
      const mine = dtos.filter((u) => u.stationId === id);
      return {
        id,
        name,
        units: mine.length,
        boxes: mine.reduce((s, u) => s + u.quantity, 0),
        notStarted: mine.filter((u) => u.status === 'NOT_STARTED').length,
        inProgress: mine.filter((u) => u.status === 'IN_PROGRESS').length,
        done: mine.filter((u) => u.status === 'DONE').length,
        late: mine.filter((u) => u.risk === 'LATE').length,
        atRisk: mine.filter((u) => u.risk === 'AT_RISK').length,
      };
    };
    const stationSummaries = stations.map((s) => summarise(s.id, s.name));
    const unassigned = summarise(null, UNASSIGNED);
    if (unassigned.units > 0) stationSummaries.push(unassigned);

    return { date, now: now.toISOString(), atRiskMinutes: settings.atRiskMinutes, stations: stationSummaries, units: dtos };
  }

  /** Production summary: what to cook per dish, split by option combination (the cook list). */
  async summary(date: CalendarDate): Promise<KitchenSummaryDto> {
    const board = await this.board(date);
    const stations = new Map(board.stations.map((s) => [s.id, s.name]));
    const dishes = new Map<string, KitchenSummaryDto['dishes'][number] & { combos: Map<string, number> }>();
    for (const u of board.units) {
      const key = u.dishName;
      const entry =
        dishes.get(key) ??
        { dishId: key, dishName: u.dishName, stationName: stations.get(u.stationId) ?? UNASSIGNED, temperature: u.temperature, boxes: 0, doneBoxes: 0, combinations: [], combos: new Map<string, number>() };
      entry.boxes += u.quantity;
      if (u.status === 'DONE') entry.doneBoxes += u.quantity;
      const label = u.label || 'As served';
      entry.combos.set(label, (entry.combos.get(label) ?? 0) + u.quantity);
      dishes.set(key, entry);
    }
    return {
      date,
      dishes: [...dishes.values()]
        .map(({ combos, ...d }) => ({
          ...d,
          combinations: [...combos.entries()].map(([label, boxes]) => ({ label, boxes })).sort((a, b) => b.boxes - a.boxes),
        }))
        .sort((a, b) => a.stationName.localeCompare(b.stationName) || b.boxes - a.boxes),
    };
  }

  start(unitId: string, actor: AuthUser): Promise<UnitActionResultDto> {
    return this.mutateUnit(unitId, actor, 'start');
  }

  done(unitId: string, actor: AuthUser): Promise<UnitActionResultDto> {
    return this.mutateUnit(unitId, actor, 'done');
  }

  private async mutateUnit(unitId: string, actor: AuthUser, action: 'start' | 'done'): Promise<UnitActionResultDto> {
    await this.cutoff.ensureProcessed();
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const orderId = await this.lockOrderOfUnit(tx, unitId);
      const unit = await tx.orderLineCombination.findUniqueOrThrow({ where: { id: unitId } });

      if (action === 'start') {
        if (unit.kitchenStartedAt) throw await this.alreadyDone(tx, 'UNIT_ALREADY_STARTED', 'started', unit.kitchenStartedById, unit.kitchenStartedAt);
        const updated = await tx.orderLineCombination.updateMany({
          where: { id: unitId, kitchenStartedAt: null },
          data: { kitchenStartedAt: now, kitchenStartedById: actor.id },
        });
        if (updated.count === 0) throw new StateConflict('UNIT_ALREADY_STARTED', 'This unit was already started.');
      } else {
        if (unit.kitchenDoneAt) throw await this.alreadyDone(tx, 'UNIT_ALREADY_DONE', 'marked done', unit.kitchenDoneById, unit.kitchenDoneAt);
        // Finishing a unit that was never started also records the start (KIT-06).
        const updated = await tx.orderLineCombination.updateMany({
          where: { id: unitId, kitchenDoneAt: null },
          data: {
            kitchenDoneAt: now,
            kitchenDoneById: actor.id,
            ...(unit.kitchenStartedAt ? {} : { kitchenStartedAt: now, kitchenStartedById: actor.id }),
          },
        });
        if (updated.count === 0) throw new StateConflict('UNIT_ALREADY_DONE', 'This unit was already marked done.');
      }

      const order = await this.refreshOrderKitchenTimes(tx, orderId, actor.id, now, false);
      const fresh = await tx.orderLineCombination.findUniqueOrThrow({ where: { id: unitId } });
      return {
        unit: {
          id: fresh.id,
          status: unitStatus(fresh.kitchenStartedAt, fresh.kitchenDoneAt),
          startedAt: fresh.kitchenStartedAt?.toISOString() ?? null,
          doneAt: fresh.kitchenDoneAt?.toISOString() ?? null,
        },
        order,
      };
    });
  }

  /** Admin: mark every unit of the order done (recording starts where missing) (KIT-11). */
  async forceComplete(orderId: string, actor: AuthUser): Promise<UnitActionResultDto['order']> {
    await this.cutoff.ensureProcessed();
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ status: string }[]>`SELECT "status" FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
      if (rows.length === 0) throw new NotFound('Order not found');
      if (rows[0]!.status !== 'CONFIRMED') {
        throw new RuleViolation('ORDER_NOT_CONFIRMED', 'Only confirmed orders can be worked on in the kitchen.');
      }
      const where = { orderLine: { orderId } };
      await tx.orderLineCombination.updateMany({
        where: { ...where, kitchenStartedAt: null },
        data: { kitchenStartedAt: now, kitchenStartedById: actor.id },
      });
      const finished = await tx.orderLineCombination.updateMany({
        where: { ...where, kitchenDoneAt: null },
        data: { kitchenDoneAt: now, kitchenDoneById: actor.id },
      });
      if (finished.count === 0) {
        const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
        if (order.kitchenReadyAt) throw new StateConflict('INVALID_TRANSITION', 'Every unit of this order is already done.');
      }
      return this.refreshOrderKitchenTimes(tx, orderId, actor.id, now, true);
    });
  }

  /** Locks the parent order row; every unit mutation of that order is serialised behind it. */
  private async lockOrderOfUnit(tx: Tx, unitId: string): Promise<string> {
    const rows = await tx.$queryRaw<{ orderId: string; status: string }[]>`
      SELECT o."id" AS "orderId", o."status" AS "status"
        FROM "OrderLineCombination" c
        JOIN "OrderLine" l ON l."id" = c."orderLineId"
        JOIN "Order" o ON o."id" = l."orderId"
       WHERE c."id" = ${unitId}::uuid
         FOR UPDATE OF o`;
    if (rows.length === 0) throw new NotFound('Prep unit not found');
    if (rows[0]!.status !== 'CONFIRMED') {
      throw new RuleViolation('ORDER_NOT_CONFIRMED', 'Only confirmed orders can be worked on in the kitchen (KIT-04).');
    }
    return rows[0]!.orderId;
  }

  /** kitchenStartedAt = first unit start; kitchenReadyAt only once every unit is done (KIT-07). */
  private async refreshOrderKitchenTimes(
    tx: Tx,
    orderId: string,
    actorId: string,
    now: Date,
    forced: boolean,
  ): Promise<UnitActionResultDto['order']> {
    const [order, undone, firstStart] = await Promise.all([
      tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { kitchenStartedAt: true, kitchenReadyAt: true } }),
      tx.orderLineCombination.count({ where: { orderLine: { orderId }, kitchenDoneAt: null } }),
      tx.orderLineCombination.aggregate({ where: { orderLine: { orderId } }, _min: { kitchenStartedAt: true } }),
    ]);
    const events: Prisma.OrderEventCreateManyInput[] = [];
    const data: Prisma.OrderUpdateInput = {};
    if (!order.kitchenStartedAt && firstStart._min.kitchenStartedAt) {
      data.kitchenStartedAt = firstStart._min.kitchenStartedAt;
      events.push({ orderId, type: 'KITCHEN_STARTED', actorId, at: now });
    }
    if (!order.kitchenReadyAt && undone === 0) {
      data.kitchenReadyAt = now;
      if (forced) data.kitchenForced = true;
      events.push({ orderId, type: forced ? 'KITCHEN_FORCE_COMPLETED' : 'KITCHEN_READY', actorId, at: now });
    }
    if (Object.keys(data).length > 0) await tx.order.update({ where: { id: orderId }, data });
    if (events.length > 0) await tx.orderEvent.createMany({ data: events });
    const after = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { kitchenStartedAt: true, kitchenReadyAt: true } });
    return {
      id: orderId,
      kitchenStartedAt: after.kitchenStartedAt?.toISOString() ?? null,
      kitchenReadyAt: after.kitchenReadyAt?.toISOString() ?? null,
    };
  }

  private async alreadyDone(
    tx: Tx,
    code: 'UNIT_ALREADY_STARTED' | 'UNIT_ALREADY_DONE',
    verb: string,
    byId: string | null,
    at: Date,
  ): Promise<StateConflict> {
    const by = byId ? await tx.staffUser.findUnique({ where: { id: byId }, select: { name: true } }) : null;
    const time = new Intl.DateTimeFormat('en-IN', { timeZone: this.clock.zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
    return new StateConflict(code, `Already ${verb}${by ? ` by ${by.name}` : ''} at ${time}.`, { by: by?.name ?? null, at: at.toISOString() });
  }
}
