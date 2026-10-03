import type { OrderableDish, OrderableGroup, OrderableOption, Temperature } from './menu';

/**
 * Order lines → combinations → selections (CAT-07…12, A-09…A-12, A-22).
 * Validates everything about what is being ordered and prices it with snapshots.
 */

export interface SelectionInput {
  groupId: string;
  optionId: string;
  portionSizeId?: string | null;
}

export interface CombinationInput {
  quantity: number;
  selections: readonly SelectionInput[];
}

export interface LineInput {
  dishId: string;
  quantity: number;
  combinations: readonly CombinationInput[];
}

export type LineIssueCode =
  | 'NOT_ON_MENU'
  | 'DUPLICATE_DISH_LINE'
  | 'VALIDATION_FAILED'
  | 'BELOW_MIN_ORDER_QTY'
  | 'COMBINATION_QTY_MISMATCH'
  | 'OPTION_NOT_IN_GROUP'
  | 'OPTION_UNAVAILABLE'
  | 'TOO_MANY_SELECTIONS'
  | 'REQUIRED_GROUP_MISSING'
  | 'PORTION_INVALID'
  | 'DUPLICATE_COMBINATION';

export interface LineIssue {
  path: (string | number)[];
  code: LineIssueCode;
  message: string;
}

export interface PricedSelection {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  portionSizeId: string | null;
  portionName: string | null;
  optionUnitPriceCents: number;
  portionExtraCents: number;
  unitCostCents: number;
}

export interface PricedCombination {
  quantity: number;
  signature: string;
  label: string;
  unitPriceCents: number;
  unitCostCents: number;
  totalCents: number;
  allergenIds: string[];
  dietaryTagIds: string[];
  selections: PricedSelection[];
}

export interface PricedLine {
  dishId: string;
  dishName: string;
  dishSku: string;
  dishTemperature: Temperature;
  quantity: number;
  dishUnitPriceCents: number;
  dishUnitCostCents: number;
  lineTotalCents: number;
  combinations: PricedCombination[];
}

export interface PricedOrder {
  issues: LineIssue[];
  /** Only lines without issues are priced. */
  lines: PricedLine[];
  /** Σ of the priced lines; meaningful only when `issues` is empty. */
  totalCents: number;
}

const isPositiveInt = (n: number) => Number.isSafeInteger(n) && n >= 1;

/** Canonical key of a set of selections, independent of the order the user picked them in. */
export function combinationSignature(dish: OrderableDish, selections: readonly SelectionInput[]): string {
  const groupOrder = new Map(dish.groups.map((g) => [g.id, g.sortOrder]));
  return [...selections]
    .map((s) => ({ ...s, rank: groupOrder.get(s.groupId) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.rank - b.rank || a.groupId.localeCompare(b.groupId) || a.optionId.localeCompare(b.optionId))
    .map((s) => `${s.groupId}:${s.optionId}:${s.portionSizeId ?? '-'}`)
    .join('|');
}

/** Allergens of a combination = union of dish and chosen options (A-17). */
export function unionIds(...lists: readonly (readonly string[])[]): string[] {
  return [...new Set(lists.flat())].sort();
}

/** Dietary tags of a combination = tags shared by the dish and every chosen option (A-17). */
export function intersectIds(first: readonly string[], ...rest: readonly (readonly string[])[]): string[] {
  return [...new Set(first)].filter((id) => rest.every((list) => list.includes(id))).sort();
}

function validateCombination(
  dish: OrderableDish,
  combo: CombinationInput,
  path: (string | number)[],
  issues: LineIssue[],
): PricedCombination | null {
  const before = issues.length;
  if (!isPositiveInt(combo.quantity)) {
    issues.push({ path: [...path, 'quantity'], code: 'VALIDATION_FAILED', message: 'Quantity must be at least 1.' });
  }

  const groups = new Map<string, OrderableGroup>(dish.groups.map((g) => [g.id, g]));
  const picked = new Map<string, { option: OrderableOption; portion: { id: string; name: string; extraCents: number } | null }[]>();

  combo.selections.forEach((sel, k) => {
    const selPath = [...path, 'selections', k];
    const group = groups.get(sel.groupId);
    if (!group) {
      issues.push({ path: selPath, code: 'OPTION_NOT_IN_GROUP', message: `That choice does not belong to ${dish.name}.` });
      return;
    }
    const option = group.options.find((o) => o.optionId === sel.optionId);
    if (!option) {
      issues.push({
        path: selPath,
        code: 'OPTION_UNAVAILABLE',
        message: `That option is not available in "${group.name}".`,
      });
      return;
    }
    let portion: { id: string; name: string; extraCents: number } | null = null;
    if (group.usesPortions) {
      const size = sel.portionSizeId ? option.portions.get(sel.portionSizeId) : undefined;
      if (!sel.portionSizeId || !size) {
        issues.push({
          path: [...selPath, 'portionSizeId'],
          code: 'PORTION_INVALID',
          message: `Choose a size for ${option.name}.`,
        });
        return;
      }
      portion = { id: sel.portionSizeId, name: size.name, extraCents: size.extraCents };
    } else if (sel.portionSizeId) {
      issues.push({
        path: [...selPath, 'portionSizeId'],
        code: 'PORTION_INVALID',
        message: `"${group.name}" is not sold in sizes.`,
      });
      return;
    }
    const list = picked.get(group.id) ?? [];
    if (list.some((p) => p.option.optionId === option.optionId)) {
      issues.push({ path: selPath, code: 'TOO_MANY_SELECTIONS', message: `${option.name} is chosen twice in "${group.name}".` });
      return;
    }
    list.push({ option, portion });
    picked.set(group.id, list);
  });

  for (const group of dish.groups) {
    const count = picked.get(group.id)?.length ?? 0;
    if (group.isRequired && count === 0) {
      issues.push({
        path: [...path, 'selections'],
        code: 'REQUIRED_GROUP_MISSING',
        message: `"${group.name}" is required.`,
      });
    }
    if (count > group.maxSelections) {
      issues.push({
        path: [...path, 'selections'],
        code: 'TOO_MANY_SELECTIONS',
        message: `Choose at most ${group.maxSelections} in "${group.name}".`,
      });
    }
  }

  if (issues.length > before) return null;

  const selections: PricedSelection[] = [];
  const labelParts: string[] = [];
  const optionAllergens: (readonly string[])[] = [];
  const optionTags: (readonly string[])[] = [];
  for (const group of dish.groups) {
    const chosen = (picked.get(group.id) ?? []).sort((a, b) => a.option.sortOrder - b.option.sortOrder);
    for (const { option, portion } of chosen) {
      selections.push({
        groupId: group.id,
        groupName: group.name,
        optionId: option.optionId,
        optionName: option.name,
        portionSizeId: portion?.id ?? null,
        portionName: portion?.name ?? null,
        optionUnitPriceCents: option.priceCents,
        portionExtraCents: portion?.extraCents ?? 0,
        unitCostCents: option.costCents,
      });
      labelParts.push(portion ? `${option.name} (${portion.name})` : option.name);
      optionAllergens.push(option.allergenIds);
      optionTags.push(option.dietaryTagIds);
    }
  }

  const unitPriceCents =
    dish.priceCents + selections.reduce((sum, s) => sum + s.optionUnitPriceCents + s.portionExtraCents, 0);
  const unitCostCents = dish.costCents + selections.reduce((sum, s) => sum + s.unitCostCents, 0);
  return {
    quantity: combo.quantity,
    signature: combinationSignature(dish, combo.selections),
    label: labelParts.join(' · '),
    unitPriceCents,
    unitCostCents,
    totalCents: unitPriceCents * combo.quantity,
    allergenIds: unionIds(dish.allergenIds, ...optionAllergens),
    dietaryTagIds: intersectIds(dish.dietaryTagIds, ...optionTags),
    selections,
  };
}

/**
 * Validates and prices order lines against the employee's orderable dishes.
 * Collects every issue (with a field path) rather than stopping at the first.
 */
export function priceOrderLines(lines: readonly LineInput[], orderable: ReadonlyMap<string, OrderableDish>): PricedOrder {
  const issues: LineIssue[] = [];
  const priced: PricedLine[] = [];
  const seenDishes = new Set<string>();

  lines.forEach((line, i) => {
    const path = ['lines', i];
    const before = issues.length;
    const dish = orderable.get(line.dishId);
    if (!dish) {
      issues.push({ path: [...path, 'dishId'], code: 'NOT_ON_MENU', message: 'This dish is not on the employee’s menu.' });
      return;
    }
    if (seenDishes.has(dish.id)) {
      issues.push({
        path: [...path, 'dishId'],
        code: 'DUPLICATE_DISH_LINE',
        message: `${dish.name} is already on this order. Add another combination to that line instead.`,
      });
      return;
    }
    seenDishes.add(dish.id);

    if (!isPositiveInt(line.quantity)) {
      issues.push({ path: [...path, 'quantity'], code: 'VALIDATION_FAILED', message: 'Quantity must be at least 1.' });
    } else if (dish.minOrderQty !== null && line.quantity < dish.minOrderQty) {
      issues.push({
        path: [...path, 'quantity'],
        code: 'BELOW_MIN_ORDER_QTY',
        message: `${dish.name} has a minimum order of ${dish.minOrderQty}.`,
      });
    }

    if (line.combinations.length === 0) {
      issues.push({
        path: [...path, 'combinations'],
        code: 'COMBINATION_QTY_MISMATCH',
        message: 'Add at least one combination.',
      });
      return;
    }

    const allocated = line.combinations.reduce((sum, c) => sum + (Number.isSafeInteger(c.quantity) ? c.quantity : 0), 0);
    if (Number.isSafeInteger(line.quantity) && allocated !== line.quantity) {
      issues.push({
        path: [...path, 'combinations'],
        code: 'COMBINATION_QTY_MISMATCH',
        message: `Combination quantities must add up to ${line.quantity} (${allocated} allocated).`,
      });
    }

    const combos: PricedCombination[] = [];
    const signatures = new Map<string, number>();
    line.combinations.forEach((combo, j) => {
      const result = validateCombination(dish, combo, [...path, 'combinations', j], issues);
      if (!result) return;
      const previous = signatures.get(result.signature);
      if (previous !== undefined) {
        issues.push({
          path: [...path, 'combinations', j],
          code: 'DUPLICATE_COMBINATION',
          message: `Same choices as combination ${previous + 1}. Merge them into one.`,
        });
        return;
      }
      signatures.set(result.signature, j);
      combos.push(result);
    });

    if (issues.length > before) return;
    priced.push({
      dishId: dish.id,
      dishName: dish.name,
      dishSku: dish.sku,
      dishTemperature: dish.temperature,
      quantity: line.quantity,
      dishUnitPriceCents: dish.priceCents,
      dishUnitCostCents: dish.costCents,
      lineTotalCents: combos.reduce((sum, c) => sum + c.totalCents, 0),
      combinations: combos,
    });
  });

  return { issues, lines: priced, totalCents: priced.reduce((sum, l) => sum + l.lineTotalCents, 0) };
}
