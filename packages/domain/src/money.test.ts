import { describe, expect, it } from 'vitest';
import { applyMultiplierBps, ceilDiv, roundUpToStep, sumCents } from './money';

describe('ceilDiv', () => {
  it('rounds up only when there is a remainder', () => {
    expect(ceilDiv(10, 5)).toBe(2);
    expect(ceilDiv(11, 5)).toBe(3);
    expect(ceilDiv(0, 5)).toBe(0);
  });

  it('is exact for large values where float division would drift', () => {
    // 2^53 - 1 is the largest safe integer; float division of nearby values loses precision.
    expect(ceilDiv(9_007_199_254_740_990, 50_000)).toBe(180_143_985_095); // …094.8 → …095
    expect(ceilDiv(9_007_199_254_700_000, 50_000)).toBe(180_143_985_094); // exact, unchanged
  });

  it('rejects non-integers and negatives', () => {
    expect(() => ceilDiv(1.5, 2)).toThrow(RangeError);
    expect(() => ceilDiv(-1, 2)).toThrow(RangeError);
    expect(() => ceilDiv(1, 0)).toThrow(RangeError);
  });
});

describe('roundUpToStep (next 5 cents)', () => {
  it('matches the brief: $2.11 becomes $2.15', () => {
    expect(roundUpToStep(211)).toBe(215);
  });

  it('leaves exact multiples unchanged', () => {
    expect(roundUpToStep(215)).toBe(215);
    expect(roundUpToStep(200)).toBe(200);
  });

  it('rounds $2.16 up to $2.20', () => {
    expect(roundUpToStep(216)).toBe(220);
  });
});

describe('applyMultiplierBps', () => {
  it('cost × 2.4 rounds up to 5 cents', () => {
    expect(applyMultiplierBps(88, 24_000)).toBe(215); // 211.2¢ → 215¢
    expect(applyMultiplierBps(250, 24_000)).toBe(600); // exact
  });

  it('"Standard + 15%" and "−10%"', () => {
    expect(applyMultiplierBps(650, 11_500)).toBe(750); // 747.5¢ → 750¢
    expect(applyMultiplierBps(650, 9_000)).toBe(585); // exact
    expect(applyMultiplierBps(649, 9_000)).toBe(585); // 584.1¢ → 585¢
  });

  it('×1 still rounds an off-step base up', () => {
    expect(applyMultiplierBps(211, 10_000)).toBe(215);
  });

  it('never produces floating-point noise (0.1 + 0.2 style cases)', () => {
    // 30¢ × 1.1 = 33¢ exactly in decimal, but 0.3 * 1.1 = 0.33000000000000007 in floats.
    expect(applyMultiplierBps(30, 11_000)).toBe(35);
    expect(applyMultiplierBps(1000, 11_000)).toBe(1100);
  });

  it('rejects out-of-range inputs', () => {
    expect(() => applyMultiplierBps(-1, 10_000)).toThrow(RangeError);
    expect(() => applyMultiplierBps(100, 0)).toThrow(RangeError);
    expect(() => applyMultiplierBps(100, 2_000_000)).toThrow(RangeError);
    expect(() => applyMultiplierBps(10.5, 10_000)).toThrow(RangeError);
  });
});

describe('sumCents', () => {
  it('sums integer cents', () => {
    expect(sumCents([215, 600, -100])).toBe(715);
    expect(sumCents([])).toBe(0);
  });

  it('rejects fractional cents', () => {
    expect(() => sumCents([1.5])).toThrow(RangeError);
  });
});
