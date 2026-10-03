import { Injectable } from '@nestjs/common';
import { fromDbDate, isOnTime } from '@fernleaf/domain';
import { type DropStage, formatOrderNumber } from '@fernleaf/shared';
import { NotFound, RuleViolation, StateConflict } from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';

type Tx = Prisma.TransactionClient;

const STAGE_LABEL: Record<DropStage, string> = {
  PENDING: 'pending',
  DISPATCH_READY: 'dispatch-ready',
  OUT_FOR_DELIVERY: 'out for delivery',
  DELIVERED: 'delivered',
};

/**
 * Drop membership (DSP-03, A-27): orders for the same company, address and exact delivery time
 * form one persisted drop, unique on (date, company, address, time).
 */
@Injectable()
export class DropService {
  /**
   * Puts confirmed orders into their drops (creating drops as needed, with the company's default
   * driver). Batched by drop key so cut-off processing of a busy day stays a handful of queries.
   */
  async attachMany(tx: Tx, orderIds: readonly string[], actorId: string | null): Promise<void> {
    if (orderIds.length === 0) return;
    const orders = await tx.order.findMany({
      where: { id: { in: [...orderIds] } },
      select: {
        id: true,
        dropId: true,
        deliveryDate: true,
        deliveryTime: true,
        deliveryAt: true,
        companyId: true,
        addressId: true,
        company: { select: { defaultDriverId: true } },
      },
    });

    const groups = new Map<string, typeof orders>();
    for (const order of orders) {
      const key = `${fromDbDate(order.deliveryDate)}|${order.companyId}|${order.addressId}|${order.deliveryTime}`;
      groups.set(key, [...(groups.get(key) ?? []), order]);
    }

    for (const members of groups.values()) {
      const first = members[0]!;
      const drop = await tx.drop.upsert({
        where: {
          deliveryDate_companyId_addressId_deliveryTime: {
            deliveryDate: first.deliveryDate,
            companyId: first.companyId,
            addressId: first.addressId,
            deliveryTime: first.deliveryTime,
          },
        },
        create: {
          deliveryDate: first.deliveryDate,
          companyId: first.companyId,
          addressId: first.addressId,
          deliveryTime: first.deliveryTime,
          deliveryAt: first.deliveryAt,
          driverId: first.company.defaultDriverId,
        },
        update: {},
      });

      if (drop.stage === 'OUT_FOR_DELIVERY' || drop.stage === 'DELIVERED') {
        throw new StateConflict(
          'DROP_DEPARTED',
          'The delivery for that company, address and time has already left. Choose a different delivery time.',
        );
      }
      if (drop.stage === 'DISPATCH_READY') {
        // A not-yet-ready order joins: the drop must be checked again (A-27).
        await tx.drop.update({ where: { id: drop.id }, data: { stage: 'PENDING', dispatchReadyAt: null } });
      }

      const joining = members.filter((m) => m.dropId !== drop.id).map((m) => m.id);
      if (joining.length === 0) continue;
      await tx.order.updateMany({ where: { id: { in: joining } }, data: { dropId: drop.id } });
      await tx.orderEvent.createMany({
        data: joining.map((orderId) => ({ orderId, type: 'DROP_ASSIGNED' as const, actorId, data: { dropId: drop.id } })),
      });
    }
  }

  /** Removes an order from its drop; deletes the drop if it is left empty and has not left yet. */
  async detach(tx: Tx, orderId: string): Promise<void> {
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { dropId: true } });
    if (!order?.dropId) return;
    await tx.order.update({ where: { id: orderId }, data: { dropId: null } });
    const remaining = await tx.order.count({
      where: { dropId: order.dropId, status: { in: ['CONFIRMED', 'DELIVERED'] } },
    });
    if (remaining === 0) {
      await tx.drop.deleteMany({ where: { id: order.dropId, stage: { in: ['PENDING', 'DISPATCH_READY'] } } });
    }
  }

  // ───────────── Stage transitions (DSP-01, DSP-02, TRD §7.3) ─────────────
  // Each one locks the drop row, checks the stage, then writes; a repeated or out-of-order
  // step gets 409 INVALID_TRANSITION. Every member order gets a timeline event.

  /** PENDING → DISPATCH_READY: every member order must be kitchen-ready. */
  async markDispatchReady(tx: Tx, dropId: string, actorId: string, now: Date): Promise<void> {
    const drop = await this.lock(tx, dropId);
    this.expectStage(drop.stage, 'PENDING', 'dispatch-ready');
    const orders = await this.members(tx, dropId);
    const notReady = orders.filter((o) => !o.kitchenReadyAt);
    if (orders.length === 0 || notReady.length > 0) {
      throw new RuleViolation(
        'DROP_NOT_READY',
        orders.length === 0
          ? 'This drop has no orders.'
          : `${orders.length - notReady.length} of ${orders.length} orders are kitchen-ready. Waiting for ${notReady.map((o) => formatOrderNumber(o.number)).join(', ')}.`,
        undefined,
        { notReady: notReady.map((o) => o.id) },
      );
    }
    await tx.drop.update({ where: { id: dropId }, data: { stage: 'DISPATCH_READY', dispatchReadyAt: now } });
    await this.event(tx, orders, 'DISPATCH_READY', actorId, now);
  }

  /** DISPATCH_READY → OUT_FOR_DELIVERY: needs a driver (by dispatch, or the driver's "picked up"). */
  async markOutForDelivery(tx: Tx, dropId: string, actorId: string, now: Date, asDriverId?: string): Promise<void> {
    const drop = await this.lock(tx, dropId, asDriverId);
    this.expectStage(drop.stage, 'DISPATCH_READY', 'out for delivery');
    if (!drop.driverId) throw new RuleViolation('DRIVER_REQUIRED', 'Assign a driver before the drop goes out for delivery.');
    await tx.drop.update({ where: { id: dropId }, data: { stage: 'OUT_FOR_DELIVERY', outForDeliveryAt: now } });
    await this.event(tx, await this.members(tx, dropId), 'OUT_FOR_DELIVERY', actorId, now);
  }

  /**
   * OUT_FOR_DELIVERY → DELIVERED. On-time is recorded once, here (A-29). Member orders become
   * DELIVERED via compare-and-set, so an order cancelled at the same moment is left alone.
   */
  async deliver(
    tx: Tx,
    dropId: string,
    actorId: string,
    now: Date,
    input: { note?: string; photoId?: string; graceMinutes: number },
    asDriverId?: string,
  ): Promise<void> {
    const drop = await this.lock(tx, dropId, asDriverId);
    this.expectStage(drop.stage, 'OUT_FOR_DELIVERY', 'delivered');
    if (input.photoId) {
      const photo = await tx.storedFile.findUnique({ where: { id: input.photoId }, select: { kind: true, createdById: true, drop: { select: { id: true } } } });
      if (!photo || photo.kind !== 'DELIVERY_PHOTO' || photo.createdById !== actorId || photo.drop) {
        throw new RuleViolation('VALIDATION_FAILED', 'That photo could not be used. Please upload it again.', [
          { path: ['photoId'], code: 'VALIDATION_FAILED', message: 'Upload the photo again.' },
        ]);
      }
    }
    const onTime = isOnTime(now, drop.deliveryAt, input.graceMinutes);
    await tx.drop.update({
      where: { id: dropId },
      data: {
        stage: 'DELIVERED',
        deliveredAt: now,
        deliveredOnTime: onTime,
        deliveredById: actorId,
        deliveryNote: input.note ? input.note : null,
        photoId: input.photoId ?? null,
      },
    });
    const orders = await this.members(tx, dropId);
    await tx.order.updateMany({
      where: { id: { in: orders.map((o) => o.id) }, status: 'CONFIRMED' },
      data: { status: 'DELIVERED', deliveredAt: now, version: { increment: 1 } },
    });
    await this.event(tx, orders, 'DELIVERED', actorId, now, { onTime });
  }

  /** Driver (or none) for a drop that hasn't left. Only staff whose role can deliver (DSP-04). */
  async assignDriver(tx: Tx, dropId: string, driverId: string | null, actorId: string, now: Date): Promise<void> {
    const drop = await this.lock(tx, dropId);
    if (drop.stage === 'OUT_FOR_DELIVERY' || drop.stage === 'DELIVERED') {
      throw new StateConflict('DROP_DEPARTED', 'This drop has already left; its driver can no longer change.');
    }
    if (drop.driverId === driverId) return;
    let driverName: string | null = null;
    if (driverId) {
      const driver = await tx.staffUser.findFirst({
        where: { id: driverId, isActive: true, role: { permissions: { has: 'deliveries.own' } } },
        select: { name: true },
      });
      if (!driver) {
        throw new RuleViolation('VALIDATION_FAILED', 'That person can’t be assigned as a driver.', [
          { path: ['driverId'], code: 'VALIDATION_FAILED', message: 'Choose an active staff member who can deliver.' },
        ]);
      }
      driverName = driver.name;
    }
    await tx.drop.update({ where: { id: dropId }, data: { driverId } });
    await this.event(tx, await this.members(tx, dropId), 'DRIVER_ASSIGNED', actorId, now, { driverId, driverName });
  }

  /** Locks the drop row. With `asDriverId`, a drop that isn't (or is no longer) theirs is a 404 (DSP-06). */
  private async lock(tx: Tx, dropId: string, asDriverId?: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Drop" WHERE "id" = ${dropId}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new NotFound('Drop not found');
    const drop = await tx.drop.findUniqueOrThrow({ where: { id: dropId } });
    if (asDriverId !== undefined && drop.driverId !== asDriverId) throw new NotFound('Drop not found');
    return drop;
  }

  private expectStage(actual: DropStage, expected: DropStage, step: string): void {
    if (actual !== expected) {
      throw new StateConflict(
        'INVALID_TRANSITION',
        `This drop is ${STAGE_LABEL[actual]}, so it can’t be marked ${step}.`,
        { stage: actual },
      );
    }
  }

  private members(tx: Tx, dropId: string) {
    return tx.order.findMany({
      where: { dropId, status: { in: ['CONFIRMED', 'DELIVERED'] } },
      select: { id: true, number: true, kitchenReadyAt: true },
    });
  }

  private async event(
    tx: Tx,
    orders: { id: string }[],
    type: 'DISPATCH_READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'DRIVER_ASSIGNED',
    actorId: string,
    at: Date,
    data?: Prisma.InputJsonObject,
  ): Promise<void> {
    if (orders.length === 0) return;
    await tx.orderEvent.createMany({ data: orders.map((o) => ({ orderId: o.id, type, actorId, at, ...(data ? { data } : {}) })) });
  }

  /** Throws if the order's drop has already left (line edits / overrides are no longer possible). */
  async assertNotDeparted(tx: Tx, dropId: string | null): Promise<void> {
    if (!dropId) return;
    const drop = await tx.drop.findUnique({ where: { id: dropId }, select: { stage: true } });
    if (drop && (drop.stage === 'OUT_FOR_DELIVERY' || drop.stage === 'DELIVERED')) {
      throw new StateConflict('DROP_DEPARTED', 'This order is already out for delivery.');
    }
  }
}
