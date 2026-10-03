/**
 * Money is always an integer number of cents (NFR-01). Multipliers are integer basis points
 * (10 000 = ×1). All arithmetic here is exact integer arithmetic.
 */

/** Largest price we accept anywhere ($100 000), keeps every product below 2^53. */
export const MAX_PRICE_CENTS = 10_000_000;
/** Largest multiplier we accept (×100). */
export const MAX_MULTIPLIER_BPS = 1_000_000;
export const BPS_ONE = 10_000;
/** Derived prices round up to the next 5 cents (PRICE-06). */
export const PRICE_STEP_CENTS = 5;

export function isCents(value: number): boolean {
  return Number.isSafeInteger(value);
}

/** Ceiling of a / b for integers a ≥ 0, b > 0, without floating-point division errors. */
export function ceilDiv(a: number, b: number): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 0 || b <= 0) {
    throw new RangeError(`ceilDiv expects integers a >= 0, b > 0 (got ${a}, ${b})`);
  }
  const remainder = a % b;
  return (a - remainder) / b + (remainder > 0 ? 1 : 0);
}

/** Rounds a non-negative cent amount up to the next multiple of `step` (exact multiples unchanged). */
export function roundUpToStep(cents: number, step = PRICE_STEP_CENTS): number {
  return ceilDiv(cents, step) * step;
}

/**
 * base × (bps / 10 000), rounded UP to the next 5 cents.
 * e.g. 211¢ × 1.0 → 215¢; cost 88¢ × 2.4 (24000 bps) = 211.2¢ → 215¢.
 * Computed as ceil(base·bps / 50 000) · 5, which equals ceil5 of the exact value.
 */
export function applyMultiplierBps(baseCents: number, bps: number): number {
  if (!Number.isSafeInteger(baseCents) || baseCents < 0 || baseCents > MAX_PRICE_CENTS) {
    throw new RangeError(`base price out of range: ${baseCents}`);
  }
  if (!Number.isSafeInteger(bps) || bps <= 0 || bps > MAX_MULTIPLIER_BPS) {
    throw new RangeError(`multiplier out of range: ${bps}`);
  }
  return ceilDiv(baseCents * bps, BPS_ONE * PRICE_STEP_CENTS) * PRICE_STEP_CENTS;
}

export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) throw new RangeError(`not an integer cent amount: ${value}`);
    total += value;
  }
  return total;
}
