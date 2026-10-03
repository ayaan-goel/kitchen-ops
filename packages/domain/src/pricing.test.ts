import { describe, expect, it } from 'vitest';
import {
  buildTierGrid,
  type PriceContext,
  resolvePrice,
  type TierRule,
  tierForCompany,
  validateTierRule,
} from './pricing';

const standard: TierRule = { id: 'standard', derivation: 'MANUAL', baseTierId: null, multiplierBps: null };
const enterprise: TierRule = { id: 'enterprise', derivation: 'FROM_TIER', baseTierId: 'standard', multiplierBps: 9_000 };
const premium: TierRule = { id: 'premium', derivation: 'FROM_TIER', baseTierId: 'standard', multiplierBps: 11_500 };
const partner: TierRule = { id: 'partner', derivation: 'FROM_COST', baseTierId: null, multiplierBps: 24_000 };
const vip: TierRule = { id: 'vip', derivation: 'FROM_TIER', baseTierId: 'enterprise', multiplierBps: 10_500 };

const bowl = { id: 'bowl', costCents: 210 };
const thali = { id: 'thali', costCents: 88 };
const newDish = { id: 'new', costCents: 300 };

function ctx(explicit: Record<string, Record<string, number>> = {}): PriceContext {
  return {
    tiers: new Map([standard, enterprise, premium, partner, vip].map((t) => [t.id, t])),
    explicit: new Map(Object.entries(explicit).map(([tier, prices]) => [tier, new Map(Object.entries(prices))])),
  };
}

const base = ctx({ standard: { bowl: 650, thali: 211 }, enterprise: { thali: 199 } });

describe('resolvePrice', () => {
  it('uses the explicit price on a manual tier', () => {
    expect(resolvePrice('standard', bowl, base)).toEqual({ cents: 650, source: 'EXPLICIT' });
  });

  it('reports a missing price on a manual tier (never $0)', () => {
    expect(resolvePrice('standard', newDish, base)).toEqual({ cents: null, source: 'MISSING' });
  });

  it('derives from cost: cost × 2.4 rounded up to 5¢', () => {
    expect(resolvePrice('partner', bowl, base)).toEqual({ cents: 505, source: 'DERIVED' }); // 504
    expect(resolvePrice('partner', thali, base)).toEqual({ cents: 215, source: 'DERIVED' }); // 211.2
  });

  it('derives from another tier: Standard + 15%', () => {
    expect(resolvePrice('premium', bowl, base)).toEqual({ cents: 750, source: 'DERIVED' }); // 747.5
  });

  it('derives Standard − 10% and rounds the brief example $2.11 → … up to 5¢', () => {
    expect(resolvePrice('enterprise', bowl, base)).toEqual({ cents: 585, source: 'DERIVED' });
    // Standard thali is 211¢; ×1.0 would be 215¢ — the rounding always goes up.
    expect(resolvePrice('premium', thali, base)).toEqual({ cents: 245, source: 'DERIVED' }); // 242.65
  });

  it('lets an explicit override beat the derivation', () => {
    expect(resolvePrice('enterprise', thali, base)).toEqual({ cents: 199, source: 'OVERRIDE' });
  });

  it('follows chains (VIP = Enterprise + 5% = Standard − 10% + 5%)', () => {
    // bowl: 650 → 585 → 614.25 → 615
    expect(resolvePrice('vip', bowl, base)).toEqual({ cents: 615, source: 'DERIVED' });
    // thali: Enterprise override 199 → ×1.05 = 208.95 → 210
    expect(resolvePrice('vip', thali, base)).toEqual({ cents: 210, source: 'DERIVED' });
  });

  it('is missing when the base tier has no price', () => {
    expect(resolvePrice('enterprise', newDish, base)).toEqual({ cents: null, source: 'MISSING' });
    expect(resolvePrice('vip', newDish, base)).toEqual({ cents: null, source: 'MISSING' });
  });

  it('a later price change only affects what is resolved afterwards (snapshots live on orders)', () => {
    const before = resolvePrice('enterprise', bowl, base).cents;
    const after = resolvePrice('enterprise', bowl, ctx({ standard: { bowl: 700 } })).cents;
    expect([before, after]).toEqual([585, 630]);
  });

  it('throws on an unknown tier and on a cycle that slipped into data', () => {
    expect(() => resolvePrice('nope', bowl, base)).toThrow(RangeError);
    const a: TierRule = { id: 'a', derivation: 'FROM_TIER', baseTierId: 'b', multiplierBps: 10_000 };
    const b: TierRule = { id: 'b', derivation: 'FROM_TIER', baseTierId: 'a', multiplierBps: 10_000 };
    const cyclic: PriceContext = { tiers: new Map([['a', a], ['b', b]]), explicit: new Map() };
    expect(() => resolvePrice('a', bowl, cyclic)).toThrow(/cycle/);
  });
});

describe('tierForCompany', () => {
  it("uses the company's tier, else the default", () => {
    expect(tierForCompany('partner', 'standard')).toBe('partner');
    expect(tierForCompany(null, 'standard')).toBe('standard');
  });
});

describe('validateTierRule', () => {
  const existing = new Map([standard, enterprise, vip].map((t) => [t.id, t]));

  it('accepts valid rules', () => {
    expect(validateTierRule(partner, existing)).toBeNull();
    expect(validateTierRule(premium, existing)).toBeNull();
    expect(validateTierRule({ ...standard, id: 'startup' }, existing)).toBeNull();
  });

  it('rejects self-derivation and cycles', () => {
    expect(validateTierRule({ ...enterprise, baseTierId: 'enterprise' }, existing)).toMatch(/itself/);
    // Standard deriving from VIP would loop: standard → vip → enterprise → standard.
    expect(
      validateTierRule({ id: 'standard', derivation: 'FROM_TIER', baseTierId: 'vip', multiplierBps: 10_000 }, existing),
    ).toMatch(/loop/);
  });

  it('rejects inconsistent shapes', () => {
    expect(validateTierRule({ ...standard, multiplierBps: 10_000 }, existing)).toMatch(/manual/);
    expect(validateTierRule({ ...partner, multiplierBps: null }, existing)).toMatch(/multiplier/);
    expect(validateTierRule({ ...partner, multiplierBps: 0 }, existing)).toMatch(/multiplier/);
    expect(validateTierRule({ ...enterprise, baseTierId: 'ghost' }, existing)).toMatch(/does not exist/);
  });
});

describe('buildTierGrid', () => {
  it('shows cost, explicit, derived and effective price and flags missing prices', () => {
    const rows = buildTierGrid('enterprise', [bowl, thali, newDish], base);
    expect(rows).toEqual([
      { itemId: 'bowl', costCents: 210, explicitCents: null, derivedCents: 585, effectiveCents: 585, source: 'DERIVED' },
      { itemId: 'thali', costCents: 88, explicitCents: 199, derivedCents: 190, effectiveCents: 199, source: 'OVERRIDE' },
      { itemId: 'new', costCents: 300, explicitCents: null, derivedCents: null, effectiveCents: null, source: 'MISSING' },
    ]);
  });
});
