/**
 * The menu as one employee sees it (MENU-01…04, PRICE-05, A-12, A-15, A-16).
 * The preview, the ordering screen and server-side order validation all use this one function,
 * so the preview is exact by construction.
 */

export type Temperature = 'HOT' | 'COLD';

export interface CatalogueGroupOption {
  optionId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  costCents: number;
  allergenIds: readonly string[];
  dietaryTagIds: readonly string[];
  /** Sizes this option supports, with the flat extra charge (A-11). */
  portions: readonly { portionSizeId: string; extraCents: number }[];
}

export interface CatalogueGroup {
  id: string;
  name: string;
  isRequired: boolean;
  maxSelections: number;
  sortOrder: number;
  usesPortions: boolean;
  portionSizes: readonly { id: string; name: string; sortOrder: number }[];
  options: readonly CatalogueGroupOption[];
}

export interface CatalogueDish {
  id: string;
  sku: string;
  name: string;
  description: string;
  imageUrl: string | null;
  temperature: Temperature;
  costCents: number;
  stationId: string | null;
  minOrderQty: number | null;
  isActive: boolean;
  allergenIds: readonly string[];
  dietaryTagIds: readonly string[];
  groups: readonly CatalogueGroup[];
}

export interface CatalogueItem {
  menuItemId: string;
  sortOrder: number;
  isActive: boolean;
  dish: CatalogueDish;
}

export interface CatalogueCategory {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  isSecret: boolean;
  items: readonly CatalogueItem[];
}

export interface CompanyVisibility {
  hiddenCategoryIds: ReadonlySet<string>;
  hiddenMenuItemIds: ReadonlySet<string>;
}

/** Effective prices on the employee's tier (null = no price). */
export interface MenuPricing {
  dishPrice(dish: CatalogueDish): number | null;
  optionPrice(option: CatalogueGroupOption): number | null;
}

export interface OrderableOption {
  optionId: string;
  name: string;
  sortOrder: number;
  priceCents: number;
  costCents: number;
  allergenIds: readonly string[];
  dietaryTagIds: readonly string[];
  /** portionSizeId → extra charge; only the group's sizes. Empty for non-portion groups. */
  portions: ReadonlyMap<string, { name: string; extraCents: number }>;
}

export interface OrderableGroup {
  id: string;
  name: string;
  isRequired: boolean;
  maxSelections: number;
  sortOrder: number;
  usesPortions: boolean;
  portionSizes: readonly { id: string; name: string }[];
  options: readonly OrderableOption[];
}

export interface OrderableDish {
  id: string;
  sku: string;
  name: string;
  description: string;
  imageUrl: string | null;
  temperature: Temperature;
  stationId: string | null;
  minOrderQty: number | null;
  priceCents: number;
  costCents: number;
  allergenIds: readonly string[];
  dietaryTagIds: readonly string[];
  groups: readonly OrderableGroup[];
}

export interface MenuCategoryView {
  id: string;
  name: string;
  slug: string;
  isSecret: boolean;
  items: { menuItemId: string; dish: OrderableDish }[];
}

export type ExclusionReason = 'HIDDEN' | 'INACTIVE' | 'NO_PRICE' | 'UNORDERABLE' | 'EMPTY';

export interface MenuExclusion {
  kind: 'CATEGORY' | 'ITEM';
  id: string;
  name: string;
  category: string;
  reason: ExclusionReason;
}

export interface ResolvedMenu {
  listed: MenuCategoryView[];
  /** Secret categories this company can still reach by link (MENU-03). */
  secret: MenuCategoryView[];
  excluded: MenuExclusion[];
  /** Every dish the employee may order (listed or reachable secret categories). */
  orderable: ReadonlyMap<string, OrderableDish>;
}

const bySort = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder;

function toOrderableDish(dish: CatalogueDish, pricing: MenuPricing): OrderableDish | 'NO_PRICE' | 'UNORDERABLE' {
  const priceCents = pricing.dishPrice(dish);
  if (priceCents === null) return 'NO_PRICE';

  const groups: OrderableGroup[] = [];
  for (const group of [...dish.groups].sort(bySort)) {
    const sizes = [...group.portionSizes].sort(bySort);
    const options: OrderableOption[] = [];
    for (const option of [...group.options].sort(bySort)) {
      if (!option.isActive) continue;
      const optionPrice = pricing.optionPrice(option);
      if (optionPrice === null) continue; // unpriced options are not offered (A-12)
      const portions = new Map<string, { name: string; extraCents: number }>();
      if (group.usesPortions) {
        const supported = new Map(option.portions.map((p) => [p.portionSizeId, p.extraCents]));
        // An option must support every size the group sells; otherwise it is not offered.
        if (!sizes.every((s) => supported.has(s.id))) continue;
        for (const size of sizes) portions.set(size.id, { name: size.name, extraCents: supported.get(size.id) as number });
      }
      options.push({
        optionId: option.optionId,
        name: option.name,
        sortOrder: option.sortOrder,
        priceCents: optionPrice,
        costCents: option.costCents,
        allergenIds: option.allergenIds,
        dietaryTagIds: option.dietaryTagIds,
        portions,
      });
    }
    if (group.isRequired && options.length === 0) return 'UNORDERABLE';
    if (options.length === 0) continue; // an optional group with nothing to offer disappears
    groups.push({
      id: group.id,
      name: group.name,
      isRequired: group.isRequired,
      maxSelections: group.maxSelections,
      sortOrder: group.sortOrder,
      usesPortions: group.usesPortions,
      portionSizes: sizes.map((s) => ({ id: s.id, name: s.name })),
      options,
    });
  }

  return {
    id: dish.id,
    sku: dish.sku,
    name: dish.name,
    description: dish.description,
    imageUrl: dish.imageUrl,
    temperature: dish.temperature,
    stationId: dish.stationId,
    minOrderQty: dish.minOrderQty,
    priceCents,
    costCents: dish.costCents,
    allergenIds: dish.allergenIds,
    dietaryTagIds: dish.dietaryTagIds,
    groups,
  };
}

export function resolveMenu(
  categories: readonly CatalogueCategory[],
  visibility: CompanyVisibility,
  pricing: MenuPricing,
): ResolvedMenu {
  const listed: MenuCategoryView[] = [];
  const secret: MenuCategoryView[] = [];
  const excluded: MenuExclusion[] = [];
  const orderable = new Map<string, OrderableDish>();
  const resolvedDishes = new Map<string, ReturnType<typeof toOrderableDish>>();

  for (const category of [...categories].sort(bySort)) {
    const cat = { kind: 'CATEGORY' as const, id: category.id, name: category.name, category: category.name };
    if (visibility.hiddenCategoryIds.has(category.id)) {
      excluded.push({ ...cat, reason: 'HIDDEN' }); // hidden beats secret
      continue;
    }
    if (!category.isActive) {
      excluded.push({ ...cat, reason: 'INACTIVE' });
      continue;
    }

    const items: MenuCategoryView['items'] = [];
    for (const item of [...category.items].sort(bySort)) {
      const exclusion = { kind: 'ITEM' as const, id: item.menuItemId, name: item.dish.name, category: category.name };
      if (visibility.hiddenMenuItemIds.has(item.menuItemId)) {
        excluded.push({ ...exclusion, reason: 'HIDDEN' });
        continue;
      }
      if (!item.isActive || !item.dish.isActive) {
        excluded.push({ ...exclusion, reason: 'INACTIVE' });
        continue;
      }
      let resolved = resolvedDishes.get(item.dish.id);
      if (!resolved) {
        resolved = toOrderableDish(item.dish, pricing);
        resolvedDishes.set(item.dish.id, resolved);
      }
      if (resolved === 'NO_PRICE' || resolved === 'UNORDERABLE') {
        excluded.push({ ...exclusion, reason: resolved });
        continue;
      }
      items.push({ menuItemId: item.menuItemId, dish: resolved });
      orderable.set(resolved.id, resolved);
    }

    if (items.length === 0) {
      excluded.push({ ...cat, reason: 'EMPTY' });
      continue;
    }
    const view = { id: category.id, name: category.name, slug: category.slug, isSecret: category.isSecret, items };
    (category.isSecret ? secret : listed).push(view);
  }

  return { listed, secret, excluded, orderable };
}
