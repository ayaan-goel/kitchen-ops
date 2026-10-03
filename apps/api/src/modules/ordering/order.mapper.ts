import { fromDbDate } from '@fernleaf/domain';
import { minutesToTime, type OrderDetailDto, type OrderListItemDto } from '@fernleaf/shared';
import type { Prisma } from '../../generated/prisma/client';

export const ORDER_DETAIL_INCLUDE = {
  employee: { select: { id: true, name: true, email: true } },
  company: { select: { id: true, name: true } },
  priceTier: { select: { name: true } },
  address: { select: { id: true, label: true } },
  packagingType: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
  drop: { select: { id: true, stage: true, driver: { select: { name: true } } } },
  invoiceLine: { select: { invoice: { select: { id: true, number: true, status: true } } } },
  adjustments: { select: { id: true, amountCents: true, reason: true, note: true, invoiceLine: { select: { id: true } } }, orderBy: { createdAt: 'asc' } },
  lines: {
    orderBy: { sortOrder: 'asc' },
    include: { combinations: { orderBy: { signature: 'asc' }, include: { selections: true } } },
  },
  events: { orderBy: { at: 'asc' }, include: { actor: { select: { name: true } } } },
} satisfies Prisma.OrderInclude;

export type OrderWithDetail = Prisma.OrderGetPayload<{ include: typeof ORDER_DETAIL_INCLUDE }>;

export function toOrderDetail(order: OrderWithDetail, cutoff: { cutoffAt: Date; locked: boolean }): OrderDetailDto {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    version: order.version,
    deliveryDate: fromDbDate(order.deliveryDate),
    deliveryTime: minutesToTime(order.deliveryTime),
    deliveryAt: order.deliveryAt.toISOString(),
    cutoffAt: cutoff.cutoffAt.toISOString(),
    locked: cutoff.locked,
    employee: order.employee,
    company: order.company,
    tierName: order.priceTier.name,
    address: { id: order.address.id, label: order.address.label, text: order.addressSnapshot },
    packagingType: order.packagingType,
    notes: order.notes,
    totalCents: order.totalCents,
    statusReason: order.statusReason,
    plannedKitchenReadyAt: order.plannedKitchenReadyAt.toISOString(),
    plannedDispatchReadyAt: order.plannedDispatchReadyAt.toISOString(),
    kitchenStartedAt: iso(order.kitchenStartedAt),
    kitchenReadyAt: iso(order.kitchenReadyAt),
    kitchenForced: order.kitchenForced,
    drop: order.drop ? { id: order.drop.id, stage: order.drop.stage, driverName: order.drop.driver?.name ?? null } : null,
    invoice: order.invoiceLine?.invoice ?? null,
    adjustments: order.adjustments.map((a) => ({
      id: a.id,
      amountCents: a.amountCents,
      reason: a.reason,
      note: a.note,
      invoiced: a.invoiceLine !== null,
    })),
    lines: order.lines.map((l) => ({
      id: l.id,
      dishId: l.dishId,
      dishName: l.dishName,
      dishSku: l.dishSku,
      quantity: l.quantity,
      dishUnitPriceCents: l.dishUnitPriceCents,
      lineTotalCents: l.lineTotalCents,
      combinations: l.combinations.map((c) => ({
        id: c.id,
        quantity: c.quantity,
        label: c.label,
        unitPriceCents: c.unitPriceCents,
        totalCents: c.totalCents,
        kitchenStartedAt: iso(c.kitchenStartedAt),
        kitchenDoneAt: iso(c.kitchenDoneAt),
        selections: c.selections.map((s) => ({
          groupId: s.optionGroupId,
          optionId: s.optionId,
          portionSizeId: s.portionSizeId,
          groupName: s.groupName,
          optionName: s.optionName,
          portionName: s.portionName,
          optionUnitPriceCents: s.optionUnitPriceCents,
          portionExtraCents: s.portionExtraCents,
        })),
      })),
    })),
    events: order.events.map((e) => ({ id: e.id, type: e.type, at: e.at.toISOString(), actor: e.actor?.name ?? null, data: e.data })),
    createdBy: order.createdBy?.name ?? null,
    createdAt: order.createdAt.toISOString(),
  };
}

export const ORDER_LIST_SELECT = {
  id: true,
  number: true,
  status: true,
  deliveryDate: true,
  deliveryTime: true,
  totalCents: true,
  kitchenReadyAt: true,
  company: { select: { id: true, name: true } },
  employee: { select: { id: true, name: true } },
  invoiceLine: { select: { id: true } },
  lines: { select: { quantity: true } },
} satisfies Prisma.OrderSelect;

export function toOrderListItem(o: Prisma.OrderGetPayload<{ select: typeof ORDER_LIST_SELECT }>): OrderListItemDto {
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    deliveryDate: fromDbDate(o.deliveryDate),
    deliveryTime: minutesToTime(o.deliveryTime),
    company: o.company,
    employee: o.employee,
    totalCents: o.totalCents,
    boxes: o.lines.reduce((sum, l) => sum + l.quantity, 0),
    invoiced: o.invoiceLine !== null,
    kitchenReady: o.kitchenReadyAt !== null,
  };
}
