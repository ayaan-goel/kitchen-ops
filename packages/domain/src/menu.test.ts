import { describe, expect, it } from 'vitest';
import { CATEGORIES, NO_HIDING, PANEER_BOWL, PRICES, pricing } from './__fixtures__/catalogue';
import { resolveMenu } from './menu';

const names = (menu: ReturnType<typeof resolveMenu>) => menu.listed.map((c) => c.name);

describe('resolveMenu', () => {
  it('lists active categories in display order and keeps secret ones separate', () => {
    const menu = resolveMenu(CATEGORIES, NO_HIDING, pricing());
    expect(names(menu)).toEqual(['Bowls', 'Desserts']);
    expect(menu.secret.map((c) => c.slug)).toEqual(['chefs-table']);
    // Secret dishes are still orderable (reachable by link).
    expect([...menu.orderable.keys()].sort()).toEqual(['biryani', 'bowl', 'jamun']);
  });

  it('hides a category or a single item for a company; hidden beats secret', () => {
    const menu = resolveMenu(
      CATEGORIES,
      { hiddenCategoryIds: new Set(['chefs']), hiddenMenuItemIds: new Set(['mi-jamun']) },
      pricing(),
    );
    expect(names(menu)).toEqual(['Bowls']);
    expect(menu.secret).toEqual([]);
    expect(menu.orderable.has('biryani')).toBe(false);
    expect(menu.orderable.has('jamun')).toBe(false);
    expect(menu.excluded.map((e) => [e.name, e.reason])).toEqual(
      expect.arrayContaining([
        ["Chef's Table", 'HIDDEN'],
        ['Gulab Jamun (2 pc)', 'HIDDEN'],
        ['Desserts', 'EMPTY'],
      ]),
    );
  });

  it('drops a dish with no price on the tier entirely — never shown at $0 (PRICE-05)', () => {
    const menu = resolveMenu(CATEGORIES, NO_HIDING, pricing({ ...PRICES, jamun: null }));
    expect(names(menu)).toEqual(['Bowls']);
    expect(menu.excluded).toContainEqual(expect.objectContaining({ name: 'Gulab Jamun (2 pc)', reason: 'NO_PRICE' }));
  });

  it('respects inactive categories, items and dishes', () => {
    const cats = CATEGORIES.map((c) =>
      c.id === 'desserts' ? { ...c, isActive: false } : c.id === 'bowls'
        ? { ...c, items: c.items.map((i) => ({ ...i, dish: { ...i.dish, isActive: false } })) }
        : c,
    );
    const menu = resolveMenu(cats, NO_HIDING, pricing());
    expect(names(menu)).toEqual([]);
    expect(menu.orderable.size).toBe(1); // only the secret biryani is left
  });

  it('does not offer unpriced or inactive options; an emptied optional group disappears', () => {
    const menu = resolveMenu(CATEGORIES, NO_HIDING, pricing({ ...PRICES, tofu: null, raita: null, chutney: null, salad: null }));
    const bowl = menu.orderable.get('bowl')!;
    expect(bowl.groups.map((g) => g.id)).toEqual(['protein', 'rice']);
    expect(bowl.groups[0]!.options.map((o) => o.optionId)).toEqual(['paneer', 'chickpeas']);
  });

  it('hides a dish whose required group has nothing orderable left (A-12)', () => {
    const menu = resolveMenu(CATEGORIES, NO_HIDING, pricing({ ...PRICES, jeera: null, brown: null }));
    expect(menu.orderable.has('bowl')).toBe(false);
    expect(menu.excluded).toContainEqual(expect.objectContaining({ name: PANEER_BOWL.name, reason: 'UNORDERABLE' }));
  });

  it('exposes portion sizes in display order with each option’s extra charge', () => {
    const rice = resolveMenu(CATEGORIES, NO_HIDING, pricing()).orderable.get('bowl')!.groups[1]!;
    expect(rice.portionSizes.map((s) => s.name)).toEqual(['Regular', 'Large']);
    expect(rice.options[1]!.portions.get('large')).toEqual({ name: 'Large', extraCents: 120 });
  });

  it('does not offer an option that lacks one of the group’s sizes', () => {
    const cats = CATEGORIES.map((c) =>
      c.id !== 'bowls'
        ? c
        : {
            ...c,
            items: c.items.map((i) => ({
              ...i,
              dish: {
                ...i.dish,
                groups: i.dish.groups.map((g) =>
                  g.id !== 'rice'
                    ? g
                    : { ...g, options: g.options.map((o) => (o.optionId === 'brown' ? { ...o, portions: [o.portions[0]!] } : o)) },
                ),
              },
            })),
          },
    );
    const rice = resolveMenu(cats, NO_HIDING, pricing()).orderable.get('bowl')!.groups[1]!;
    expect(rice.options.map((o) => o.optionId)).toEqual(['jeera']);
  });
});
