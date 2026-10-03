import { Injectable } from '@nestjs/common';
import { buildTierGrid, type PriceContext, resolvePrice, type TierRule, validateTierRule } from '@fernleaf/domain';
import type { PriceSetInput, PriceTierDto, TierGridDto, TierInput } from '@fernleaf/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { NotFound, RuleViolation } from '../../common/errors/domain-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MenuCatalogueService } from '../ordering/menu-catalogue.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { uniqueName } from './unique';

interface PricingState {
  tiers: Map<string, TierRule & { name: string; description: string; companies: number }>;
  dishes: { id: string; name: string; sku: string; isActive: boolean; costCents: number }[];
  options: { id: string; name: string; isActive: boolean; costCents: number }[];
  dishCtx: PriceContext;
  optionCtx: PriceContext;
  defaultTierId: string;
}

/**
 * Price tiers and the whole-tier grid (PRICE-01…07). Effective prices always come from the domain's
 * `resolvePrice`; nothing derived is stored, only explicit prices and overrides.
 */
@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
    private readonly catalogue: MenuCatalogueService,
  ) {}

  async tiers(): Promise<PriceTierDto[]> {
    const s = await this.state();
    return [...s.tiers.values()]
      .map((t) => this.tierDto(t.id, s))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
  }

  async createTier(input: Required<TierInput>): Promise<PriceTierDto> {
    const s = await this.state();
    this.assertRule({ id: '__new', ...input }, s);
    const row = await uniqueName(() => this.prisma.priceTier.create({ data: input }), input.name);
    this.catalogue.invalidate();
    return this.tierDto(row.id, await this.state());
  }

  async updateTier(id: string, input: Required<TierInput>): Promise<PriceTierDto> {
    const s = await this.state();
    if (!s.tiers.has(id)) throw new NotFound('Price tier not found');
    this.assertRule({ id, ...input }, s);
    await uniqueName(() => this.prisma.priceTier.update({ where: { id }, data: input }), input.name);
    this.catalogue.invalidate();
    return this.tierDto(id, await this.state());
  }

  /** Exactly one default tier, held by settings (PRICE-02). */
  async makeDefault(id: string, actor: AuthUser): Promise<PriceTierDto[]> {
    if (!(await this.prisma.priceTier.findUnique({ where: { id }, select: { id: true } }))) throw new NotFound('Price tier not found');
    await this.prisma.platformSettings.update({ where: { id: 1 }, data: { defaultPriceTierId: id, updatedById: actor.id } });
    this.settings.invalidate();
    this.catalogue.invalidate();
    return this.tiers();
  }

  async grid(tierId: string, kind: 'dishes' | 'options'): Promise<TierGridDto> {
    const s = await this.state();
    if (!s.tiers.has(tierId)) throw new NotFound('Price tier not found');
    const items: { id: string; name: string; sku?: string; isActive: boolean; costCents: number }[] = kind === 'dishes' ? s.dishes : s.options;
    const rows = buildTierGrid(tierId, items, kind === 'dishes' ? s.dishCtx : s.optionCtx);
    const byId = new Map(items.map((i) => [i.id, i]));
    return {
      tier: this.tierDto(tierId, s),
      kind,
      rows: rows.map((r) => {
        const item = byId.get(r.itemId)!;
        return { ...r, name: item.name, sku: item.sku ?? null, isActive: item.isActive };
      }),
    };
  }

  /** Sets or clears one explicit price. Existing orders keep their snapshots (BR-08). */
  async setPrice(tierId: string, input: PriceSetInput): Promise<TierGridDto> {
    if (!(await this.prisma.priceTier.findUnique({ where: { id: tierId }, select: { id: true } }))) throw new NotFound('Price tier not found');
    if (input.kind === 'dishes') {
      if (input.priceCents === null) await this.prisma.dishPrice.deleteMany({ where: { tierId, dishId: input.itemId } });
      else
        await this.prisma.dishPrice.upsert({
          where: { tierId_dishId: { tierId, dishId: input.itemId } },
          create: { tierId, dishId: input.itemId, priceCents: input.priceCents },
          update: { priceCents: input.priceCents },
        });
    } else if (input.priceCents === null) {
      await this.prisma.optionPrice.deleteMany({ where: { tierId, optionId: input.itemId } });
    } else {
      await this.prisma.optionPrice.upsert({
        where: { tierId_optionId: { tierId, optionId: input.itemId } },
        create: { tierId, optionId: input.itemId, priceCents: input.priceCents },
        update: { priceCents: input.priceCents },
      });
    }
    this.catalogue.invalidate();
    return this.grid(tierId, input.kind);
  }

  private assertRule(rule: TierRule, s: PricingState): void {
    const others = new Map([...s.tiers].filter(([id]) => id !== rule.id));
    const problem = validateTierRule(rule, others);
    if (problem) {
      const code = /loop|itself/.test(problem) ? 'TIER_CYCLE' : 'VALIDATION_FAILED';
      const field = /multiplier/i.test(problem) ? 'multiplierBps' : /base|loop|itself/.test(problem) ? 'baseTierId' : 'derivation';
      throw new RuleViolation(code, problem, [{ path: [field], code, message: problem }]);
    }
  }

  private tierDto(id: string, s: PricingState): PriceTierDto {
    const t = s.tiers.get(id)!;
    const missing = (items: { id: string; costCents: number; isActive: boolean }[], ctx: PriceContext) =>
      items.filter((i) => i.isActive && resolvePrice(id, i, ctx).cents === null).length;
    return {
      id,
      name: t.name,
      description: t.description,
      derivation: t.derivation,
      baseTierId: t.baseTierId,
      baseTierName: t.baseTierId ? (s.tiers.get(t.baseTierId)?.name ?? null) : null,
      multiplierBps: t.multiplierBps,
      isDefault: id === s.defaultTierId,
      companies: t.companies,
      missingDishes: missing(s.dishes, s.dishCtx),
      missingOptions: missing(s.options, s.optionCtx),
    };
  }

  private async state(): Promise<PricingState> {
    const [tiers, dishes, options, dishPrices, optionPrices, { settings }] = await Promise.all([
      this.prisma.priceTier.findMany({ include: { _count: { select: { companies: true } } } }),
      this.prisma.dish.findMany({ select: { id: true, name: true, sku: true, isActive: true, costCents: true }, orderBy: { sku: 'asc' } }),
      this.prisma.option.findMany({ select: { id: true, name: true, isActive: true, costCents: true }, orderBy: { name: 'asc' } }),
      this.prisma.dishPrice.findMany({ select: { tierId: true, dishId: true, priceCents: true } }),
      this.prisma.optionPrice.findMany({ select: { tierId: true, optionId: true, priceCents: true } }),
      this.settings.get(),
    ]);
    const tierMap = new Map(
      tiers.map((t) => [
        t.id,
        { id: t.id, name: t.name, description: t.description, derivation: t.derivation, baseTierId: t.baseTierId, multiplierBps: t.multiplierBps, companies: t._count.companies },
      ]),
    );
    const explicit = (rows: { tierId: string; itemId: string; priceCents: number }[]) => {
      const map = new Map<string, Map<string, number>>();
      for (const r of rows) map.set(r.tierId, (map.get(r.tierId) ?? new Map()).set(r.itemId, r.priceCents));
      return map;
    };
    return {
      tiers: tierMap,
      dishes,
      options,
      dishCtx: { tiers: tierMap, explicit: explicit(dishPrices.map((p) => ({ tierId: p.tierId, itemId: p.dishId, priceCents: p.priceCents }))) },
      optionCtx: { tiers: tierMap, explicit: explicit(optionPrices.map((p) => ({ tierId: p.tierId, itemId: p.optionId, priceCents: p.priceCents }))) },
      defaultTierId: settings.defaultPriceTierId,
    };
  }
}
