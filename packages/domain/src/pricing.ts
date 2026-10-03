import { applyMultiplierBps, MAX_MULTIPLIER_BPS } from './money';

/**
 * Price-tier resolution (PRICE-01…08, A-13, A-14). Effective prices are computed, never stored;
 * orders snapshot the result at capture time.
 */

export type TierDerivation = 'MANUAL' | 'FROM_COST' | 'FROM_TIER';

export interface TierRule {
  id: string;
  name?: string;
  derivation: TierDerivation;
  baseTierId: string | null;
  multiplierBps: number | null;
}

/** An item that can be priced: a dish or an option. */
export interface PricedItem {
  id: string;
  costCents: number;
}

export interface PriceContext {
  tiers: ReadonlyMap<string, TierRule>;
  /** tierId → itemId → explicit price (MANUAL tier price, or override on a derived tier). */
  explicit: ReadonlyMap<string, ReadonlyMap<string, number>>;
}

export type PriceSource = 'EXPLICIT' | 'OVERRIDE' | 'DERIVED' | 'MISSING';

export interface ResolvedPrice {
  cents: number | null;
  source: PriceSource;
}

const MISSING: ResolvedPrice = { cents: null, source: 'MISSING' };

function getTier(ctx: PriceContext, tierId: string): TierRule {
  const tier = ctx.tiers.get(tierId);
  if (!tier) throw new RangeError(`Unknown price tier ${tierId}`);
  return tier;
}

/** The price derived from the tier's rule, ignoring any explicit price on this tier. */
export function derivedPrice(
  tierId: string,
  item: PricedItem,
  ctx: PriceContext,
  visiting: Set<string> = new Set(),
): ResolvedPrice {
  const tier = getTier(ctx, tierId);
  if (visiting.has(tierId)) throw new RangeError(`Price tier cycle detected at ${tierId}`);
  visiting.add(tierId);

  switch (tier.derivation) {
    case 'MANUAL':
      return MISSING;
    case 'FROM_COST':
      return { cents: applyMultiplierBps(item.costCents, tier.multiplierBps as number), source: 'DERIVED' };
    case 'FROM_TIER': {
      const base = resolvePrice(tier.baseTierId as string, item, ctx, visiting);
      if (base.cents === null) return MISSING;
      return { cents: applyMultiplierBps(base.cents, tier.multiplierBps as number), source: 'DERIVED' };
    }
  }
}

/**
 * Effective price of an item on a tier:
 * explicit price on the tier wins → otherwise the tier's derivation → otherwise missing.
 */
export function resolvePrice(
  tierId: string,
  item: PricedItem,
  ctx: PriceContext,
  visiting: Set<string> = new Set(),
): ResolvedPrice {
  const tier = getTier(ctx, tierId);
  const explicit = ctx.explicit.get(tierId)?.get(item.id);
  if (explicit !== undefined) {
    return { cents: explicit, source: tier.derivation === 'MANUAL' ? 'EXPLICIT' : 'OVERRIDE' };
  }
  return derivedPrice(tierId, item, ctx, visiting);
}

/** The tier an employee is priced on: their company's tier, else the default tier (PRICE-04). */
export function tierForCompany(companyTierId: string | null, defaultTierId: string): string {
  return companyTierId ?? defaultTierId;
}

/**
 * Validates a tier rule before saving. Returns a human-readable problem, or null if valid.
 * `tiers` must contain the other existing tiers (the rule being saved replaces its own entry).
 */
export function validateTierRule(rule: TierRule, tiers: ReadonlyMap<string, TierRule>): string | null {
  const needsMultiplier = rule.derivation !== 'MANUAL';
  if (needsMultiplier) {
    if (
      rule.multiplierBps === null ||
      !Number.isSafeInteger(rule.multiplierBps) ||
      rule.multiplierBps <= 0 ||
      rule.multiplierBps > MAX_MULTIPLIER_BPS
    ) {
      return 'Enter a multiplier between ×0.0001 and ×100.';
    }
  } else if (rule.multiplierBps !== null || rule.baseTierId !== null) {
    return 'A manual tier has no base tier or multiplier.';
  }

  if (rule.derivation === 'FROM_COST' && rule.baseTierId !== null) {
    return 'A tier derived from cost has no base tier.';
  }
  if (rule.derivation === 'FROM_TIER') {
    if (!rule.baseTierId) return 'Choose the tier to derive from.';
    if (rule.baseTierId === rule.id) return 'A tier cannot derive from itself.';
    const all = new Map(tiers);
    all.set(rule.id, rule);
    let current: string | null = rule.baseTierId;
    const seen = new Set<string>([rule.id]);
    while (current) {
      if (seen.has(current)) return 'This would create a loop of tiers deriving from each other.';
      seen.add(current);
      const next = all.get(current);
      if (!next) return 'The base tier does not exist.';
      current = next.derivation === 'FROM_TIER' ? next.baseTierId : null;
    }
  }
  return null;
}

export interface TierGridRow {
  itemId: string;
  costCents: number;
  explicitCents: number | null;
  derivedCents: number | null;
  effectiveCents: number | null;
  source: PriceSource;
}

/** One row per item for the "whole tier" grid (PRICE-07), including missing prices. */
export function buildTierGrid(tierId: string, items: readonly PricedItem[], ctx: PriceContext): TierGridRow[] {
  return items.map((item) => {
    const explicit = ctx.explicit.get(tierId)?.get(item.id) ?? null;
    const derived = derivedPrice(tierId, item, ctx);
    const effective = resolvePrice(tierId, item, ctx);
    return {
      itemId: item.id,
      costCents: item.costCents,
      explicitCents: explicit,
      derivedCents: derived.cents,
      effectiveCents: effective.cents,
      source: effective.source,
    };
  });
}
