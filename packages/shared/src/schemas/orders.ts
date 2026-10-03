import { z } from 'zod';
import { calendarDateSchema, paginationQuerySchema, timeOfDaySchema, uuidSchema } from './common';

export const ORDER_STATUSES = ['DRAFT', 'PLACED', 'CONFIRMED', 'DELIVERED', 'CANCELLED', 'REJECTED'] as const;
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

const quantity = z.number().int('Use a whole number').min(1, 'At least 1').max(500, 'At most 500');

export const selectionInputSchema = z.object({
  groupId: uuidSchema,
  optionId: uuidSchema,
  portionSizeId: uuidSchema.nullish(),
});

export const combinationInputSchema = z.object({
  quantity,
  selections: z.array(selectionInputSchema).max(20),
});

export const lineInputSchema = z.object({
  dishId: uuidSchema,
  quantity,
  combinations: z.array(combinationInputSchema).min(1, 'Add at least one combination').max(20),
});

/** Body of POST /api/orders/quote, POST /api/orders and PUT /api/orders/:id (TRD §6.8). */
export const orderInputSchema = z.object({
  employeeId: uuidSchema,
  deliveryDate: calendarDateSchema,
  deliveryTime: timeOfDaySchema.optional(),
  addressId: uuidSchema.optional(),
  packagingTypeId: uuidSchema.optional(),
  notes: z.string().trim().max(500).default(''),
  lines: z.array(lineInputSchema).max(30),
});
export type OrderInput = z.infer<typeof orderInputSchema>;

export const createOrderSchema = orderInputSchema.extend({
  intent: z.enum(['DRAFT', 'PLACE']),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const updateOrderSchema = orderInputSchema.omit({ employeeId: true }).extend({
  version: z.number().int().min(0),
  intent: z.enum(['DRAFT', 'PLACE']).optional(),
});
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

export const reasonSchema = z.object({ reason: z.string().trim().min(3, 'Give a short reason').max(300) });

export const deliveryOverrideSchema = z.object({
  version: z.number().int().min(0),
  deliveryTime: timeOfDaySchema.optional(),
  addressId: uuidSchema.optional(),
  packagingTypeId: uuidSchema.optional(),
});

const booleanQuery = z.enum(['true', 'false']).transform((v) => v === 'true');

/** GET /api/orders query (ORD-06). */
export const orderListQuerySchema = paginationQuerySchema.extend({
  deliveryFrom: calendarDateSchema.optional(),
  deliveryTo: calendarDateSchema.optional(),
  status: z
    .union([orderStatusSchema, z.array(orderStatusSchema)])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  companyId: uuidSchema.optional(),
  invoiced: booleanQuery.optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['deliveryDate:desc', 'deliveryDate:asc', 'number:desc', 'number:asc']).default('deliveryDate:desc'),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

/** Quote response: the server's authoritative breakdown (no browser price maths). */
export interface QuoteResponse {
  valid: boolean;
  issues: { path: (string | number)[]; code: string; message: string }[];
  warnings: { path: (string | number)[]; message: string }[];
  locked: boolean;
  cutoffAt: string | null;
  lines: {
    dishId: string;
    dishName: string;
    quantity: number;
    dishUnitPriceCents: number;
    lineTotalCents: number;
    combinations: { label: string; quantity: number; unitPriceCents: number; totalCents: number }[];
  }[];
  totalCents: number;
}
