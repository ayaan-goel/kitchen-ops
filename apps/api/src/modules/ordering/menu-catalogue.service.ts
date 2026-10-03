import { Injectable } from '@nestjs/common';
import {
  type CatalogueCategory,
  type PriceContext,
  resolveMenu,
  resolvePrice,
  type ResolvedMenu,
  type TierRule,
  tierForCompany,
} from '@fernleaf/domain';
import type { EmployeeMenuDto, MenuCategoryDto } from '@fernleaf/shared';
import { NotFound } from '../../common/errors/domain-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';

interface CatalogueSnapshot {
  categories: CatalogueCategory[];
  tiers: Map<string, TierRule & { name: string }>;
  dishCtx: PriceContext;
  optionCtx: PriceContext;
  allergenNames: Map<string, string>;
  tagNames: Map<string, string>;
  loadedAt: number;
}

export interface CompanyMenu {
  menu: ResolvedMenu;
  tier: { id: string; name: string; isDefault: boolean };
  allergenNames: Map<string, string>;
  tagNames: Map<string, string>;
}

// Catalogue/menu/price edits call invalidate(); the TTL is only a safety net.
const TTL_MS = 5 * 60_000;

/**
 * Loads the catalogue, menu and price lists and resolves the menu for one company through the
 * pure `resolveMenu` (MENU-04): preview, quote and order validation all come through here.
 * The catalogue snapshot is cached briefly; catalogue edits call `invalidate()`.
 */
@Injectable()
export class MenuCatalogueService {
  private snapshot: Promise<CatalogueSnapshot> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
  ) {}

  invalidate(): void {
    this.snapshot = null;
  }

  async forCompany(companyId: string): Promise<CompanyMenu> {
    const [snap, { settings }, company] = await Promise.all([
      this.getSnapshot(),
      this.settings.get(),
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: {
          priceTierId: true,
          hiddenCategories: { select: { categoryId: true } },
          hiddenMenuItems: { select: { menuItemId: true } },
        },
      }),
    ]);
    if (!company) throw new NotFound('Company not found');

    const tierId = tierForCompany(company.priceTierId, settings.defaultPriceTierId);
    const tier = snap.tiers.get(tierId);
    if (!tier) throw new NotFound('Price tier not found');

    const menu = resolveMenu(
      snap.categories,
      {
        hiddenCategoryIds: new Set(company.hiddenCategories.map((h) => h.categoryId)),
        hiddenMenuItemIds: new Set(company.hiddenMenuItems.map((h) => h.menuItemId)),
      },
      {
        dishPrice: (dish) => resolvePrice(tierId, dish, snap.dishCtx).cents,
        optionPrice: (option) => resolvePrice(tierId, { id: option.optionId, costCents: option.costCents }, snap.optionCtx).cents,
      },
    );
    return {
      menu,
      tier: { id: tierId, name: tier.name, isDefault: tierId === settings.defaultPriceTierId },
      allergenNames: snap.allergenNames,
      tagNames: snap.tagNames,
    };
  }

  toDto(companyMenu: CompanyMenu): EmployeeMenuDto {
    const { menu, allergenNames, tagNames } = companyMenu;
    const names = (ids: readonly string[], map: Map<string, string>) => ids.map((id) => map.get(id) ?? id);
    const category = (c: ResolvedMenu['listed'][number]): MenuCategoryDto => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      isSecret: c.isSecret,
      items: c.items.map(({ menuItemId, dish }) => ({
        menuItemId,
        dish: {
          id: dish.id,
          sku: dish.sku,
          name: dish.name,
          description: dish.description,
          imageUrl: dish.imageUrl,
          temperature: dish.temperature,
          priceCents: dish.priceCents,
          minOrderQty: dish.minOrderQty,
          allergens: names(dish.allergenIds, allergenNames),
          dietaryTags: names(dish.dietaryTagIds, tagNames),
          groups: dish.groups.map((g) => ({
            id: g.id,
            name: g.name,
            isRequired: g.isRequired,
            maxSelections: g.maxSelections,
            usesPortions: g.usesPortions,
            options: g.options.map((o) => ({
              optionId: o.optionId,
              name: o.name,
              priceCents: o.priceCents,
              allergens: names(o.allergenIds, allergenNames),
              portions: g.portionSizes.map((s) => ({
                portionSizeId: s.id,
                name: s.name,
                extraCents: o.portions.get(s.id)?.extraCents ?? 0,
              })),
            })),
          })),
        },
      })),
    });
    return {
      tier: companyMenu.tier,
      listed: menu.listed.map(category),
      secret: menu.secret.map(category),
      excluded: menu.excluded.map((e) => ({ kind: e.kind, name: e.name, category: e.category, reason: e.reason })),
    };
  }

  private getSnapshot(): Promise<CatalogueSnapshot> {
    const fresh = this.snapshot;
    if (fresh) {
      return fresh.then((s) => (Date.now() - s.loadedAt < TTL_MS ? s : this.reload()));
    }
    return this.reload();
  }

  private reload(): Promise<CatalogueSnapshot> {
    this.snapshot = this.load().catch((err: unknown) => {
      this.snapshot = null;
      throw err;
    });
    return this.snapshot;
  }

  private async load(): Promise<CatalogueSnapshot> {
    const [categories, tiers, dishPrices, optionPrices, allergens, tags] = await Promise.all([
      this.prisma.menuCategory.findMany({
        include: {
          items: {
            include: {
              dish: {
                include: {
                  allergens: { select: { allergenId: true } },
                  dietaryTags: { select: { dietaryTagId: true } },
                  optionGroups: {
                    include: {
                      items: {
                        include: {
                          option: {
                            include: {
                              allergens: { select: { allergenId: true } },
                              dietaryTags: { select: { dietaryTagId: true } },
                              portions: { select: { portionSizeId: true, extraCents: true } },
                            },
                          },
                        },
                      },
                      portionSizes: { include: { portionSize: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.priceTier.findMany(),
      this.prisma.dishPrice.findMany({ select: { tierId: true, dishId: true, priceCents: true } }),
      this.prisma.optionPrice.findMany({ select: { tierId: true, optionId: true, priceCents: true } }),
      this.prisma.allergen.findMany({ select: { id: true, name: true } }),
      this.prisma.dietaryTag.findMany({ select: { id: true, name: true } }),
    ]);

    const explicit = (rows: { tierId: string; itemId: string; priceCents: number }[]) => {
      const map = new Map<string, Map<string, number>>();
      for (const r of rows) {
        const inner = map.get(r.tierId) ?? new Map<string, number>();
        inner.set(r.itemId, r.priceCents);
        map.set(r.tierId, inner);
      }
      return map;
    };
    const tierMap = new Map(
      tiers.map((t) => [
        t.id,
        { id: t.id, name: t.name, derivation: t.derivation, baseTierId: t.baseTierId, multiplierBps: t.multiplierBps },
      ]),
    );

    return {
      loadedAt: Date.now(),
      tiers: tierMap,
      dishCtx: { tiers: tierMap, explicit: explicit(dishPrices.map((p) => ({ tierId: p.tierId, itemId: p.dishId, priceCents: p.priceCents }))) },
      optionCtx: {
        tiers: tierMap,
        explicit: explicit(optionPrices.map((p) => ({ tierId: p.tierId, itemId: p.optionId, priceCents: p.priceCents }))),
      },
      allergenNames: new Map(allergens.map((a) => [a.id, a.name])),
      tagNames: new Map(tags.map((t) => [t.id, t.name])),
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        isSecret: c.isSecret,
        items: c.items.map((i) => ({
          menuItemId: i.id,
          sortOrder: i.sortOrder,
          isActive: i.isActive,
          dish: {
            id: i.dish.id,
            sku: i.dish.sku,
            name: i.dish.name,
            description: i.dish.description,
            imageUrl: i.dish.imageUrl,
            temperature: i.dish.temperature,
            costCents: i.dish.costCents,
            stationId: i.dish.stationId,
            minOrderQty: i.dish.minOrderQty,
            isActive: i.dish.isActive,
            allergenIds: i.dish.allergens.map((a) => a.allergenId),
            dietaryTagIds: i.dish.dietaryTags.map((t) => t.dietaryTagId),
            groups: i.dish.optionGroups.map((g) => ({
              id: g.id,
              name: g.name,
              isRequired: g.isRequired,
              maxSelections: g.maxSelections,
              sortOrder: g.sortOrder,
              usesPortions: g.usesPortions,
              portionSizes: g.portionSizes.map((s) => ({ id: s.portionSizeId, name: s.portionSize.name, sortOrder: s.sortOrder })),
              options: g.items.map((gi) => ({
                optionId: gi.optionId,
                name: gi.option.name,
                sortOrder: gi.sortOrder,
                isActive: gi.option.isActive,
                costCents: gi.option.costCents,
                allergenIds: gi.option.allergens.map((a) => a.allergenId),
                dietaryTagIds: gi.option.dietaryTags.map((t) => t.dietaryTagId),
                portions: gi.option.portions,
              })),
            })),
          },
        })),
      })),
    };
  }
}
