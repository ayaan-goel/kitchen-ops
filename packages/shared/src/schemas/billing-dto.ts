import { z } from 'zod';
import { calendarDateSchema, paginationQuerySchema, uuidSchema } from './common';

/** Company billing (TRD §6.14, PRD BIL-01…06, A-31…A-34). Money is integer cents. */

export const INVOICE_STATUSES = ['ISSUED', 'PAID'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const ADJUSTMENT_REASONS = [
  'CANCELLED_AFTER_INVOICE',
  'REJECTED_AFTER_INVOICE',
  'SHORT_DELIVERY',
  'PRICE_CORRECTION',
  'OTHER',
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];
/** Reasons staff can pick; the *_AFTER_INVOICE ones are created by the system on cancel/reject. */
export const MANUAL_ADJUSTMENT_REASONS = ['SHORT_DELIVERY', 'PRICE_CORRECTION', 'OTHER'] as const;

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, string> = {
  CANCELLED_AFTER_INVOICE: 'Cancelled after invoicing',
  REJECTED_AFTER_INVOICE: 'Rejected after invoicing',
  SHORT_DELIVERY: 'Short delivery',
  PRICE_CORRECTION: 'Price correction',
  OTHER: 'Other',
};

export const billableQuerySchema = z
  .object({ deliveryFrom: calendarDateSchema.optional(), deliveryTo: calendarDateSchema.optional() })
  .refine((q) => !q.deliveryFrom || !q.deliveryTo || q.deliveryFrom <= q.deliveryTo, {
    message: 'The start date must be on or before the end date',
    path: ['deliveryTo'],
  });
export type BillableQuery = z.infer<typeof billableQuerySchema>;

export const createInvoiceSchema = z
  .object({
    companyId: uuidSchema,
    orderIds: z.array(uuidSchema).max(2000).default([]),
    adjustmentIds: z.array(uuidSchema).max(500).default([]),
    notes: z.string().trim().max(500).default(''),
  })
  .refine((v) => v.orderIds.length + v.adjustmentIds.length > 0, { message: 'Select at least one order or adjustment', path: ['orderIds'] })
  .refine((v) => new Set(v.orderIds).size === v.orderIds.length && new Set(v.adjustmentIds).size === v.adjustmentIds.length, {
    message: 'An item was selected twice',
    path: ['orderIds'],
  });
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const markPaidSchema = z.object({
  /** Kitchen-local date the payment arrived; defaults to today. */
  paidOn: calendarDateSchema.optional(),
  reference: z.string().trim().max(100).optional(),
});
export type MarkPaidInput = z.infer<typeof markPaidSchema>;

export const createAdjustmentSchema = z.object({
  /** < 0 credit, > 0 debit. */
  amountCents: z
    .number()
    .int('Use whole cents')
    .refine((v) => v !== 0, 'Enter a non-zero amount')
    .refine((v) => Math.abs(v) <= 10_000_000, 'That amount is too large'),
  reason: z.enum(MANUAL_ADJUSTMENT_REASONS),
  note: z.string().trim().min(3, 'Say briefly why').max(300),
});
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;

export const invoiceListQuerySchema = paginationQuerySchema.extend({
  companyId: uuidSchema.optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
});
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export interface BillingCompanyDto {
  id: string;
  name: string;
  unbilledOrders: number;
  unbilledCents: number;
  pendingAdjustments: number;
  pendingAdjustmentCents: number;
  outstandingInvoices: number;
  outstandingCents: number;
  /** Earliest delivery date among unbilled orders. */
  oldestUnbilled: string | null;
}

export interface BillableOrderDto {
  id: string;
  number: number;
  deliveryDate: string;
  employeeName: string;
  status: 'CONFIRMED' | 'DELIVERED';
  totalCents: number;
}

export interface PendingAdjustmentDto {
  id: string;
  orderId: string;
  orderNumber: number;
  amountCents: number;
  reason: AdjustmentReason;
  note: string;
  createdAt: string;
}

export interface CompanyBillableDto {
  company: { id: string; name: string; billingContactName: string; billingEmail: string };
  orders: BillableOrderDto[];
  adjustments: PendingAdjustmentDto[];
}

export interface InvoiceListItemDto {
  id: string;
  number: number;
  company: { id: string; name: string };
  status: InvoiceStatus;
  issuedAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  totalCents: number;
  lineCount: number;
  paidAt: string | null;
}

export interface InvoiceLineDto {
  id: string;
  kind: 'ORDER' | 'ADJUSTMENT';
  orderId: string | null;
  orderNumber: number | null;
  description: string;
  deliveryDate: string | null;
  amountCents: number;
}

export interface InvoiceDetailDto extends InvoiceListItemDto {
  billTo: { companyName: string; contactName: string; email: string; phone: string | null; address: string };
  notes: string;
  paymentReference: string | null;
  issuedBy: string | null;
  paidBy: string | null;
  lines: InvoiceLineDto[];
  /** Σ line amounts; always equals totalCents (NFR-01), shown as proof. */
  linesSumCents: number;
}
