import { Injectable } from '@nestjs/common';
import {
  cancellationCredit,
  dbDate,
  fromDbDate,
  type PricedLine,
  plannedTimes,
  zonedInstant,
} from '@fernleaf/domain';
import {
  type CreateOrderInput,
  type ErrorCode,
  minutesToTime,
  type OrderDetailDto,
  type OrderInput,
  type OrderListItemDto,
  type OrderListQuery,
  type OrderWriteResultDto,
  type Paginated,
  type QuoteResponse,
  timeToMinutes,
  type UpdateOrderInput,
} from '@fernleaf/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { NotFound, RuleViolation, StateConflict } from '../../common/errors/domain-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { OrderStatus, Prisma } from '../../generated/prisma/client';
import { CutoffService } from '../cutoff/cutoff.service';
import { DropService } from '../dispatch/drop.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { ORDER_DETAIL_INCLUDE, ORDER_LIST_SELECT, toOrderDetail, toOrderListItem } from './order.mapper';
import { formatAddress, OrderPipelineService, type PipelineResult, TIME_STEP_MINUTES } from './order-pipeline.service';

type Tx = Prisma.TransactionClient;

const TERMINAL: OrderStatus[] = ['DELIVERED', 'CANCELLED', 'REJECTED'];

function assertValid(result: PipelineResult): void {
  if (result.issues.length === 0) return;
  const [first] = result.issues;
  throw new RuleViolation(
    first!.code as ErrorCode,
    result.issues.length === 1 ? first!.message : `${result.issues.length} problems need fixing before this order can be saved.`,
    result.issues,
  );
}

/** Canonical content of a line: same dish + same combinations and quantities ⇒ unchanged (A-08). */
function lineKey(dishId: string, combos: readonly { signature: string; quantity: number }[]): string {
  return `${dishId}#${combos.map((c) => `${c.signature}x${c.quantity}`).sort().join(',')}`;
}

function lineCreate(line: PricedLine, sortOrder: number, pricedAt: Date): Prisma.OrderLineCreateWithoutOrderInput {
  return {
    dish: { connect: { id: line.dishId } },
    quantity: line.quantity,
    dishName: line.dishName,
    dishSku: line.dishSku,
    dishTemperature: line.dishTemperature,
    dishUnitPriceCents: line.dishUnitPriceCents,
    dishUnitCostCents: line.dishUnitCostCents,
    lineTotalCents: line.lineTotalCents,
    sortOrder,
    pricedAt,
    combinations: {
      create: line.combinations.map((c) => ({
        quantity: c.quantity,
        signature: c.signature,
        label: c.label,
        unitPriceCents: c.unitPriceCents,
        unitCostCents: c.unitCostCents,
        totalCents: c.totalCents,
        selections: {
          create: c.selections.map((s) => ({
            optionGroup: { connect: { id: s.groupId } },
            option: { connect: { id: s.optionId } },
            ...(s.portionSizeId ? { portionSize: { connect: { id: s.portionSizeId } } } : {}),
            groupName: s.groupName,
            optionName: s.optionName,
            portionName: s.portionName,
            optionUnitPriceCents: s.optionUnitPriceCents,
            portionExtraCents: s.portionExtraCents,
            unitCostCents: s.unitCostCents,
          })),
        },
      })),
    },
  };
}

/**
 * Order lifecycle (ORD-01…08, A-07, A-08, A-23, A-32). Every write re-runs the shared pipeline,
 * uses compare-and-set on version/status (NFR-03) and appends timeline events (ORD-07).
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly settings: PlatformSettingsService,
    private readonly pipeline: OrderPipelineService,
    private readonly cutoff: CutoffService,
    private readonly drops: DropService,
  ) {}

  // ───────────────────────── Quote ─────────────────────────

  async quote(input: OrderInput, actor: AuthUser): Promise<QuoteResponse> {
    const result = await this.pipeline.evaluate({ ...input, intent: 'QUOTE', actor });
    return {
      valid: result.issues.length === 0,
      issues: result.issues,
      warnings: result.warnings,
      locked: result.locked,
      cutoffAt: result.cutoffAt.toISOString(),
      lines: result.priced.lines.map((l) => ({
        dishId: l.dishId,
        dishName: l.dishName,
        quantity: l.quantity,
        dishUnitPriceCents: l.dishUnitPriceCents,
        lineTotalCents: l.lineTotalCents,
        combinations: l.combinations.map((c) => ({
          label: c.label,
          quantity: c.quantity,
          unitPriceCents: c.unitPriceCents,
          totalCents: c.totalCents,
        })),
      })),
      totalCents: result.priced.totalCents,
    };
  }

  // ───────────────────────── Create ─────────────────────────

  async create(input: CreateOrderInput, actor: AuthUser): Promise<OrderWriteResultDto> {
    await this.cutoff.ensureProcessed();
    const result = await this.pipeline.evaluate({ ...input, intent: input.intent, actor });
    assertValid(result);

    const ctx = result.context;
    // An admin placing for a locked date: confirmation already happened, so confirm now (A-07).
    const status: OrderStatus = input.intent === 'DRAFT' ? 'DRAFT' : result.locked ? 'CONFIRMED' : 'PLACED';
    const now = this.clock.now();

    const id = await this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.create({
          data: {
            status,
            employee: { connect: { id: ctx.employeeId } },
            company: { connect: { id: ctx.companyId } },
            priceTier: { connect: { id: ctx.tierId } },
            deliveryDate: dbDate(ctx.deliveryDate),
            deliveryTime: ctx.deliveryTime,
            deliveryAt: ctx.deliveryAt,
            address: { connect: { id: ctx.addressId } },
            addressSnapshot: ctx.addressSnapshot,
            packagingType: { connect: { id: ctx.packagingTypeId } },
            notes: input.notes,
            totalCents: result.priced.totalCents,
            dispatchLeadMinutes: ctx.dispatchLeadMinutes,
            plannedDispatchReadyAt: ctx.plannedDispatchReadyAt,
            plannedKitchenReadyAt: ctx.plannedKitchenReadyAt,
            placedAt: status === 'DRAFT' ? null : now,
            confirmedAt: status === 'CONFIRMED' ? now : null,
            createdBy: { connect: { id: actor.id } },
            lines: { create: result.priced.lines.map((l, i) => lineCreate(l, i, now)) },
          },
          select: { id: true },
        });
        const events: Prisma.OrderEventCreateManyInput[] = [{ orderId: order.id, type: 'CREATED', actorId: actor.id, at: now }];
        if (status !== 'DRAFT') events.push({ orderId: order.id, type: 'PLACED', actorId: actor.id, at: now });
        if (status === 'CONFIRMED') {
          events.push({ orderId: order.id, type: 'CONFIRMED', actorId: actor.id, at: now, data: { afterCutoff: true } });
        }
        await tx.orderEvent.createMany({ data: events });
        if (status === 'CONFIRMED') await this.drops.attachMany(tx, [order.id], actor.id);
        return order.id;
      },
      { timeout: 30_000 },
    );
    return { order: await this.detail(id), warnings: result.warnings };
  }

  // ───────────────────────── Update (incl. placing a draft) ─────────────────────────

  async update(id: string, input: UpdateOrderInput, actor: AuthUser): Promise<OrderWriteResultDto> {
    await this.cutoff.ensureProcessed();
    const existing = await this.prisma.order.findUnique({
      where: { id },
      include: { lines: { include: { combinations: true } }, invoiceLine: { select: { id: true } } },
    });
    if (!existing) throw new NotFound('Order not found');
    if (existing.version !== input.version) {
      throw new StateConflict('CONFLICT_STALE', 'Someone else changed this order. Reload to see the latest version.');
    }
    if (TERMINAL.includes(existing.status)) {
      throw new StateConflict('INVALID_TRANSITION', `A ${existing.status.toLowerCase()} order can’t be edited.`);
    }
    const canOverride = actor.permissions.has('orders.override');
    const isConfirmed = existing.status === 'CONFIRMED';
    if (isConfirmed && !canOverride) {
      throw new RuleViolation('CUTOFF_PASSED', 'This order is confirmed (cut-off passed). Only an admin can change it.');
    }
    if (existing.status !== 'DRAFT' && input.intent === 'DRAFT') {
      throw new StateConflict('INVALID_TRANSITION', 'A placed order can’t go back to draft.');
    }
    if (isConfirmed && input.deliveryDate !== fromDbDate(existing.deliveryDate)) {
      throw new RuleViolation('VALIDATION_FAILED', 'A confirmed order’s delivery date can’t change. Cancel it and create a new one.', [
        { path: ['deliveryDate'], code: 'VALIDATION_FAILED', message: 'Delivery date is fixed after confirmation.' },
      ]);
    }

    const placing = existing.status === 'DRAFT' && input.intent === 'PLACE';
    const staysDraft = existing.status === 'DRAFT' && !placing;
    const result = await this.pipeline.evaluate({
      employeeId: existing.employeeId,
      deliveryDate: input.deliveryDate,
      deliveryTime: input.deliveryTime,
      addressId: input.addressId,
      packagingTypeId: input.packagingTypeId,
      lines: input.lines,
      intent: staysDraft ? 'DRAFT' : 'PLACE',
      actor,
      existing: {
        deliveryTime: existing.deliveryTime,
        addressId: existing.addressId,
        packagingTypeId: existing.packagingTypeId,
        companyId: existing.companyId,
      },
    });
    assertValid(result);
    const ctx = result.context;

    // Line diff: drafts are always re-priced; placed/confirmed orders keep unchanged lines (A-08).
    const repriceAll = existing.status === 'DRAFT';
    const existingByDish = new Map(existing.lines.map((l) => [l.dishId, l]));
    const keptLineIds = new Set<string>();
    const toCreate: { line: PricedLine; index: number }[] = [];
    result.priced.lines.forEach((line, index) => {
      const old = existingByDish.get(line.dishId);
      if (!repriceAll && old && lineKey(old.dishId, old.combinations) === lineKey(line.dishId, line.combinations)) {
        keptLineIds.add(old.id);
      } else {
        toCreate.push({ line, index });
      }
    });
    const toDelete = existing.lines.filter((l) => !keptLineIds.has(l.id)).map((l) => l.id);
    const linesChanged = toDelete.length > 0 || toCreate.length > 0;
    // What staff actually changed (drafts are re-written on every save even when unchanged).
    const oldKeys = existing.lines.map((l) => lineKey(l.dishId, l.combinations)).sort().join('|');
    const newKeys = result.priced.lines.map((l) => lineKey(l.dishId, l.combinations)).sort().join('|');
    const contentChanged = oldKeys !== newKeys;
    const deliveryChanged = ctx.deliveryTime !== existing.deliveryTime || ctx.addressId !== existing.addressId;

    if (linesChanged && existing.invoiceLine && !repriceAll) {
      throw new RuleViolation('ORDER_INVOICED', 'This order is already invoiced, so its dishes can’t change. Add an adjustment instead.');
    }
    const total =
      existing.lines.filter((l) => keptLineIds.has(l.id)).reduce((sum, l) => sum + l.lineTotalCents, 0) +
      toCreate.reduce((sum, c) => sum + c.line.lineTotalCents, 0);

    const status: OrderStatus = placing ? (result.locked ? 'CONFIRMED' : 'PLACED') : existing.status;
    const now = this.clock.now();

    await this.prisma.$transaction(
      async (tx) => {
        if (isConfirmed && (linesChanged || deliveryChanged)) await this.drops.assertNotDeparted(tx, existing.dropId);

        const updated = await tx.order.updateMany({
          where: { id, version: input.version },
          data: {
            status,
            deliveryDate: dbDate(ctx.deliveryDate),
            deliveryTime: ctx.deliveryTime,
            deliveryAt: ctx.deliveryAt,
            addressId: ctx.addressId,
            addressSnapshot: ctx.addressSnapshot,
            packagingTypeId: ctx.packagingTypeId,
            priceTierId: repriceAll ? ctx.tierId : existing.priceTierId,
            notes: input.notes,
            totalCents: total,
            plannedDispatchReadyAt: ctx.plannedDispatchReadyAt,
            plannedKitchenReadyAt: ctx.plannedKitchenReadyAt,
            ...(placing ? { placedAt: now } : {}),
            ...(status === 'CONFIRMED' && placing ? { confirmedAt: now } : {}),
            version: { increment: 1 },
          },
        });
        if (updated.count === 0) {
          throw new StateConflict('CONFLICT_STALE', 'Someone else changed this order. Reload to see the latest version.');
        }
        if (toDelete.length > 0) await tx.orderLine.deleteMany({ where: { id: { in: toDelete } } });
        for (const { line, index } of toCreate) {
          await tx.orderLine.create({ data: { ...lineCreate(line, index, now), order: { connect: { id } } } });
        }
        if (isConfirmed && linesChanged) await this.refreshKitchenReady(tx, id);

        const events: Prisma.OrderEventCreateManyInput[] = [];
        if (contentChanged || deliveryChanged || existing.notes !== input.notes) {
          events.push({ orderId: id, type: 'UPDATED', actorId: actor.id, at: now, data: { linesChanged: contentChanged, deliveryChanged } });
        }
        if (placing) events.push({ orderId: id, type: 'PLACED', actorId: actor.id, at: now });
        if (placing && status === 'CONFIRMED') {
          events.push({ orderId: id, type: 'CONFIRMED', actorId: actor.id, at: now, data: { afterCutoff: true } });
        }
        if (events.length > 0) await tx.orderEvent.createMany({ data: events });

        if (placing && status === 'CONFIRMED') await this.drops.attachMany(tx, [id], actor.id);
        if (isConfirmed && deliveryChanged) {
          await this.drops.detach(tx, id);
          await this.drops.attachMany(tx, [id], actor.id);
        }
      },
      { timeout: 30_000 },
    );
    return { order: await this.detail(id), warnings: result.warnings };
  }

  /** Places a draft as it is stored (re-validated and re-priced, A-08). */
  async place(id: string, version: number, actor: AuthUser): Promise<OrderWriteResultDto> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { lines: { orderBy: { sortOrder: 'asc' }, include: { combinations: { include: { selections: true } } } } },
    });
    if (!order) throw new NotFound('Order not found');
    if (order.status !== 'DRAFT') throw new StateConflict('INVALID_TRANSITION', 'Only drafts can be placed.');
    return this.update(
      id,
      {
        version,
        intent: 'PLACE',
        deliveryDate: fromDbDate(order.deliveryDate),
        deliveryTime: minutesToTime(order.deliveryTime),
        addressId: order.addressId,
        packagingTypeId: order.packagingTypeId,
        notes: order.notes,
        lines: order.lines.map((l) => ({
          dishId: l.dishId,
          quantity: l.quantity,
          combinations: l.combinations.map((c) => ({
            quantity: c.quantity,
            selections: c.selections.map((s) => ({
              // A group removed from the dish since the draft was saved fails validation (OPTION_NOT_IN_GROUP).
              groupId: s.optionGroupId ?? 'removed-group',
              optionId: s.optionId,
              portionSizeId: s.portionSizeId,
            })),
          })),
        })),
      },
      actor,
    );
  }

  // ───────────────────────── Cancel / reject ─────────────────────────

  async cancel(id: string, reason: string, actor: AuthUser): Promise<OrderDetailDto> {
    return this.void(id, 'CANCELLED', reason, actor);
  }

  async reject(id: string, reason: string, actor: AuthUser): Promise<OrderDetailDto> {
    return this.void(id, 'REJECTED', reason, actor);
  }

  private async void(id: string, target: 'CANCELLED' | 'REJECTED', reason: string, actor: AuthUser): Promise<OrderDetailDto> {
    await this.cutoff.ensureProcessed();
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { invoiceLine: { select: { amountCents: true } }, adjustments: { select: { amountCents: true } } },
    });
    if (!order) throw new NotFound('Order not found');
    const canOverride = actor.permissions.has('orders.override');
    const allowedFrom: OrderStatus[] = target === 'CANCELLED' ? ['DRAFT', 'PLACED', 'CONFIRMED'] : ['PLACED', 'CONFIRMED'];
    if (!allowedFrom.includes(order.status)) {
      throw new StateConflict('INVALID_TRANSITION', `A ${order.status.toLowerCase()} order can’t be ${target === 'CANCELLED' ? 'cancelled' : 'rejected'}.`);
    }
    if (order.status === 'CONFIRMED' && !canOverride) {
      throw new RuleViolation('CUTOFF_PASSED', 'This order is confirmed. Only an admin can cancel it now.');
    }
    if (order.status !== 'CONFIRMED' && !canOverride) {
      const { locked } = await this.cutoff.cutoffFor(fromDbDate(order.deliveryDate));
      if (locked) throw new RuleViolation('CUTOFF_PASSED', 'Ordering for this date has closed. Only an admin can cancel now.');
    }

    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id, status: order.status },
        data: {
          status: target,
          statusReason: reason,
          ...(target === 'CANCELLED' ? { cancelledAt: now } : { rejectedAt: now }),
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) throw new StateConflict('INVALID_TRANSITION', 'This order changed meanwhile. Reload and try again.');
      await tx.orderEvent.create({ data: { orderId: id, type: target, actorId: actor.id, at: now, data: { reason } } });
      if (order.status === 'CONFIRMED') await this.drops.detach(tx, id);

      // Already invoiced: invoices never change; credit the net billed amount on the next invoice (A-32).
      if (order.invoiceLine) {
        const credit = cancellationCredit(order.invoiceLine.amountCents, order.adjustments.map((a) => a.amountCents));
        if (credit !== 0) {
          await tx.billingAdjustment.create({
            data: {
              companyId: order.companyId,
              orderId: id,
              amountCents: credit,
              reason: target === 'CANCELLED' ? 'CANCELLED_AFTER_INVOICE' : 'REJECTED_AFTER_INVOICE',
              note: reason,
              createdById: actor.id,
            },
          });
          await tx.orderEvent.create({
            data: { orderId: id, type: 'ADJUSTMENT_ADDED', actorId: actor.id, at: now, data: { amountCents: credit } },
          });
        }
      }
    });
    return this.detail(id);
  }

  // ───────────────────────── Admin delivery override (ORD-08) ─────────────────────────

  async overrideDelivery(
    id: string,
    input: { version: number; deliveryTime?: string; addressId?: string; packagingTypeId?: string },
    actor: AuthUser,
  ): Promise<OrderDetailDto> {
    await this.cutoff.ensureProcessed();
    const order = await this.prisma.order.findUnique({ where: { id }, include: { address: true } });
    if (!order) throw new NotFound('Order not found');
    if (order.version !== input.version) {
      throw new StateConflict('CONFLICT_STALE', 'Someone else changed this order. Reload to see the latest version.');
    }
    if (order.status !== 'CONFIRMED') {
      throw new StateConflict('INVALID_TRANSITION', 'Delivery overrides apply to confirmed orders. Edit the order instead.');
    }
    const { settings } = await this.settings.get();
    const issues: { path: string[]; code: string; message: string }[] = [];

    let deliveryTime = order.deliveryTime;
    if (input.deliveryTime !== undefined) {
      const minutes = timeToMinutes(input.deliveryTime);
      if (minutes < settings.deliveryWindowStart || minutes > settings.deliveryWindowEnd || minutes % TIME_STEP_MINUTES !== 0) {
        issues.push({
          path: ['deliveryTime'],
          code: 'TIME_OUTSIDE_WINDOW',
          message: `Choose a time between ${minutesToTime(settings.deliveryWindowStart)} and ${minutesToTime(settings.deliveryWindowEnd)} in ${TIME_STEP_MINUTES}-minute steps.`,
        });
      } else deliveryTime = minutes;
    }
    let address = order.address;
    if (input.addressId !== undefined && input.addressId !== order.addressId) {
      const next = await this.prisma.companyAddress.findFirst({ where: { id: input.addressId, companyId: order.companyId, isActive: true } });
      if (!next) issues.push({ path: ['addressId'], code: 'ADDRESS_INVALID', message: 'Choose one of the company’s active delivery addresses.' });
      else address = next;
    }
    let packagingTypeId = order.packagingTypeId;
    if (input.packagingTypeId !== undefined && input.packagingTypeId !== order.packagingTypeId) {
      const p = await this.prisma.packagingType.findFirst({ where: { id: input.packagingTypeId, isActive: true } });
      if (!p) issues.push({ path: ['packagingTypeId'], code: 'VALIDATION_FAILED', message: 'Choose an active packaging type.' });
      else packagingTypeId = p.id;
    }
    if (issues.length > 0) throw new RuleViolation(issues[0]!.code as ErrorCode, issues[0]!.message, issues);

    const deliveryAt = zonedInstant(fromDbDate(order.deliveryDate), deliveryTime, this.clock.zone);
    const plan = plannedTimes(deliveryAt, order.dispatchLeadMinutes, settings.kitchenBufferMinutes);
    const moved = deliveryTime !== order.deliveryTime || address.id !== order.addressId;
    const now = this.clock.now();
    const before = { deliveryTime: minutesToTime(order.deliveryTime), address: order.addressSnapshot, packagingTypeId: order.packagingTypeId };
    const after = { deliveryTime: minutesToTime(deliveryTime), address: formatAddress(address), packagingTypeId };

    await this.prisma.$transaction(async (tx) => {
      await this.drops.assertNotDeparted(tx, order.dropId);
      const updated = await tx.order.updateMany({
        where: { id, version: input.version, status: 'CONFIRMED' },
        data: {
          deliveryTime,
          deliveryAt,
          addressId: address.id,
          addressSnapshot: after.address,
          packagingTypeId,
          plannedDispatchReadyAt: plan.plannedDispatchReadyAt,
          plannedKitchenReadyAt: plan.plannedKitchenReadyAt,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) throw new StateConflict('CONFLICT_STALE', 'Someone else changed this order. Reload to see the latest version.');
      await tx.orderEvent.create({ data: { orderId: id, type: 'DELIVERY_CHANGED', actorId: actor.id, at: now, data: { before, after } } });
      if (moved) {
        await this.drops.detach(tx, id);
        await this.drops.attachMany(tx, [id], actor.id);
      }
    });
    return this.detail(id);
  }

  // ───────────────────────── Reads ─────────────────────────

  async list(query: OrderListQuery): Promise<Paginated<OrderListItemDto>> {
    await this.cutoff.ensureProcessed();
    const where: Prisma.OrderWhereInput = {};
    if (query.deliveryFrom || query.deliveryTo) {
      where.deliveryDate = {
        ...(query.deliveryFrom ? { gte: dbDate(query.deliveryFrom) } : {}),
        ...(query.deliveryTo ? { lte: dbDate(query.deliveryTo) } : {}),
      };
    }
    if (query.status?.length) where.status = { in: query.status };
    if (query.companyId) where.companyId = query.companyId;
    if (query.invoiced !== undefined) where.invoiceLine = query.invoiced ? { isNot: null } : { is: null };
    if (query.q) {
      const number = /^(?:fl-?)?0*(\d{1,9})$/i.exec(query.q)?.[1];
      where.OR = [
        ...(number ? [{ number: Number(number) }] : []),
        { employee: { name: { contains: query.q, mode: 'insensitive' } } },
        { employee: { email: { contains: query.q, mode: 'insensitive' } } },
        { company: { name: { contains: query.q, mode: 'insensitive' } } },
      ];
    }
    const [field, direction] = query.sort.split(':') as ['deliveryDate' | 'number', 'asc' | 'desc'];
    const orderBy: Prisma.OrderOrderByWithRelationInput[] =
      field === 'deliveryDate' ? [{ deliveryDate: direction }, { deliveryTime: direction }, { number: direction }] : [{ number: direction }];

    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: ORDER_LIST_SELECT,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items: rows.map(toOrderListItem), page: query.page, pageSize: query.pageSize, total };
  }

  async detail(id: string): Promise<OrderDetailDto> {
    await this.cutoff.ensureProcessed();
    const order = await this.prisma.order.findUnique({ where: { id }, include: ORDER_DETAIL_INCLUDE });
    if (!order) throw new NotFound('Order not found');
    const cutoff = await this.cutoff.cutoffFor(fromDbDate(order.deliveryDate));
    return toOrderDetail(order, cutoff);
  }

  /** After a confirmed order's lines change, kitchen-ready only stands if every unit is done. */
  private async refreshKitchenReady(tx: Tx, orderId: string): Promise<void> {
    const undone = await tx.orderLineCombination.count({ where: { orderLine: { orderId }, kitchenDoneAt: null } });
    if (undone > 0) await tx.order.update({ where: { id: orderId }, data: { kitchenReadyAt: null } });
  }
}
