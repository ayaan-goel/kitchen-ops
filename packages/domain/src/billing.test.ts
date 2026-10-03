import { describe, expect, it } from 'vitest';
import { cancellationCredit, checkAdjustment, invoiceTotal, isBillable, netBilled } from './billing';

describe('isBillable (BIL-01, A-31)', () => {
  it('bills confirmed and delivered orders only', () => {
    expect(isBillable('CONFIRMED')).toBe(true);
    expect(isBillable('DELIVERED')).toBe(true);
    for (const s of ['DRAFT', 'PLACED', 'CANCELLED', 'REJECTED'] as const) expect(isBillable(s)).toBe(false);
  });
});

describe('invoiceTotal (NFR-01)', () => {
  it('is exactly the sum of its lines, including credit lines', () => {
    expect(invoiceTotal([7540, 3290, -500])).toBe(10_330);
  });

  it('allows a credit-only invoice (credit note, A-33)', () => {
    expect(invoiceTotal([-1200])).toBe(-1200);
  });
});

describe('adjustments after invoicing (BIL-06, A-32)', () => {
  it('cancelling an invoiced order credits the full net amount', () => {
    expect(cancellationCredit(7540, [])).toBe(-7540);
    expect(netBilled(7540, [cancellationCredit(7540, [])])).toBe(0);
  });

  it('accounts for earlier credits (short delivery, then cancellation)', () => {
    const shortDelivery = -770;
    const credit = cancellationCredit(7540, [shortDelivery]);
    expect(credit).toBe(-6770);
    expect(netBilled(7540, [shortDelivery, credit])).toBe(0);
  });

  it('has nothing left to credit once fully credited', () => {
    expect(cancellationCredit(7540, [-7540])).toBe(0);
  });

  it('rejects credits larger than what remains billed', () => {
    expect(checkAdjustment(-770, 7540, [])).toBeNull();
    expect(checkAdjustment(-7540, 7540, [-770])).toMatch(/larger than what remains/);
    expect(checkAdjustment(-6770, 7540, [-770])).toBeNull();
  });

  it('allows debits and rejects zero or fractional amounts', () => {
    expect(checkAdjustment(250, 7540, [])).toBeNull();
    expect(checkAdjustment(0, 7540, [])).toMatch(/non-zero/);
    expect(checkAdjustment(-1.5, 7540, [])).toMatch(/non-zero/);
  });
});
