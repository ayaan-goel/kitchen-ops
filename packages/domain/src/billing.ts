import { sumCents } from './money';

/**
 * Company billing rules (BIL-01…06, A-31…A-34).
 * Invoices are immutable snapshots; later changes to an invoiced order become adjustments
 * (credits < 0, debits > 0) that are billed on the company's next invoice.
 */

export type OrderStatus = 'DRAFT' | 'PLACED' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED' | 'REJECTED';

/** Confirmed orders are owed in full from confirmation; delivered orders stay billable (A-31). */
export function isBillable(status: OrderStatus): boolean {
  return status === 'CONFIRMED' || status === 'DELIVERED';
}

/** What the company has been (or will be) charged for one order: billed base + all adjustments. */
export function netBilled(baseCents: number, adjustmentsCents: readonly number[]): number {
  return baseCents + sumCents(adjustmentsCents);
}

/**
 * The credit that brings an invoiced order's net charge to zero when it is cancelled or rejected
 * after invoicing. Returns 0 if nothing remains to credit.
 */
export function cancellationCredit(invoicedCents: number, adjustmentsCents: readonly number[]): number {
  const net = netBilled(invoicedCents, adjustmentsCents);
  return net > 0 ? -net : 0;
}

/**
 * Validates a new adjustment. Credits may never take the order's net charge below zero
 * (A-32: net credits never exceed what was billed). Returns a message, or null if allowed.
 */
export function checkAdjustment(
  amountCents: number,
  baseCents: number,
  existingAdjustmentsCents: readonly number[],
): string | null {
  if (!Number.isSafeInteger(amountCents) || amountCents === 0) {
    return 'Enter a non-zero whole-cent amount.';
  }
  const netAfter = netBilled(baseCents, existingAdjustmentsCents) + amountCents;
  if (netAfter < 0) {
    const maxCredit = netBilled(baseCents, existingAdjustmentsCents);
    return `This credit is larger than what remains billed for the order (at most ${maxCredit} cents).`;
  }
  return null;
}

/** An invoice total is exactly the sum of its line amounts (NFR-01). */
export function invoiceTotal(lineAmountsCents: readonly number[]): number {
  return sumCents(lineAmountsCents);
}
