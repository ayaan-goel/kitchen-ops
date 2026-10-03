import { Injectable } from '@nestjs/common';
import { fromDbDate } from '@fernleaf/domain';
import { StateConflict } from '../../common/errors/domain-error';
import type { Prisma } from '../../generated/prisma/client';

type Tx = Prisma.TransactionClient;

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

  /** Removes an order from its drop; deletes the drop if it is left empty and has not moved yet. */
  async detach(tx: Tx, orderId: string): Promise<void> {
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { dropId: true } });
    if (!order?.dropId) return;
    await tx.order.update({ where: { id: orderId }, data: { dropId: null } });
    const remaining = await tx.order.count({
      where: { dropId: order.dropId, status: { in: ['CONFIRMED', 'DELIVERED'] } },
    });
    if (remaining === 0) {
      await tx.drop.deleteMany({ where: { id: order.dropId, stage: 'PENDING' } });
    }
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
