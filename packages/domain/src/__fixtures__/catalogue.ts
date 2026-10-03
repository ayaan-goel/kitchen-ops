import type { CatalogueCategory, CatalogueDish, CatalogueGroupOption, MenuPricing } from '../menu';

/** Test fixture: a small, realistic catalogue (prices in cents). Not part of the build. */

export const option = (
  optionId: string,
  name: string,
  sortOrder: number,
  extra: Partial<CatalogueGroupOption> = {},
): CatalogueGroupOption => ({
  optionId,
  name,
  sortOrder,
  isActive: true,
  costCents: 30,
  allergenIds: [],
  dietaryTagIds: ['veg'],
  portions: [],
  ...extra,
});

export const PANEER_BOWL: CatalogueDish = {
  id: 'bowl',
  sku: 'FL-BWL-001',
  name: 'Paneer Tikka Rice Bowl',
  description: '',
  imageUrl: null,
  temperature: 'HOT',
  costCents: 210,
  stationId: 'curry',
  minOrderQty: null,
  isActive: true,
  allergenIds: ['dairy'],
  dietaryTagIds: ['veg', 'gf'],
  groups: [
    {
      id: 'protein',
      name: 'Choose your protein',
      isRequired: true,
      maxSelections: 1,
      sortOrder: 1,
      usesPortions: false,
      portionSizes: [],
      options: [
        option('paneer', 'Paneer', 1, { allergenIds: ['dairy'], dietaryTagIds: ['veg', 'gf'] }),
        option('tofu', 'Tofu', 2, { allergenIds: ['soy'], dietaryTagIds: ['veg', 'vegan', 'gf'] }),
        option('chickpeas', 'Chickpeas', 3, { dietaryTagIds: ['veg', 'vegan', 'gf'] }),
      ],
    },
    {
      id: 'rice',
      name: 'Choose your rice',
      isRequired: true,
      maxSelections: 1,
      sortOrder: 2,
      usesPortions: true,
      portionSizes: [
        { id: 'large', name: 'Large', sortOrder: 2 },
        { id: 'regular', name: 'Regular', sortOrder: 1 },
      ],
      options: [
        option('jeera', 'Jeera rice', 1, {
          dietaryTagIds: ['veg', 'vegan', 'gf'],
          portions: [
            { portionSizeId: 'regular', extraCents: 0 },
            { portionSizeId: 'large', extraCents: 100 },
          ],
        }),
        option('brown', 'Brown rice', 2, {
          dietaryTagIds: ['veg', 'vegan', 'gf'],
          portions: [
            { portionSizeId: 'regular', extraCents: 0 },
            { portionSizeId: 'large', extraCents: 120 },
          ],
        }),
      ],
    },
    {
      id: 'sides',
      name: 'Add sides',
      isRequired: false,
      maxSelections: 2,
      sortOrder: 3,
      usesPortions: false,
      portionSizes: [],
      options: [
        option('raita', 'Raita', 1, { allergenIds: ['dairy'], dietaryTagIds: ['veg', 'gf'] }),
        option('chutney', 'Mint chutney', 2, { dietaryTagIds: ['veg', 'vegan', 'gf'] }),
        option('salad', 'Kachumber salad', 3, { dietaryTagIds: ['veg', 'vegan', 'gf'] }),
      ],
    },
  ],
};

export const GULAB_JAMUN: CatalogueDish = {
  id: 'jamun',
  sku: 'FL-DST-001',
  name: 'Gulab Jamun (2 pc)',
  description: '',
  imageUrl: null,
  temperature: 'COLD',
  costCents: 40,
  stationId: null,
  minOrderQty: null,
  isActive: true,
  allergenIds: ['dairy', 'gluten'],
  dietaryTagIds: ['veg'],
  groups: [],
};

export const BIRYANI_HANDI: CatalogueDish = {
  ...GULAB_JAMUN,
  id: 'biryani',
  sku: 'FL-CHF-002',
  name: 'Hyderabadi Biryani Handi',
  temperature: 'HOT',
  costCents: 400,
  minOrderQty: 2,
  allergenIds: [],
};

/** Standard-tier prices. */
export const PRICES: Record<string, number> = {
  bowl: 650,
  jamun: 180,
  biryani: 1200,
  paneer: 80,
  tofu: 60,
  chickpeas: 0, // explicitly free choice — still chosen (A-13)
  jeera: 0,
  brown: 40,
  raita: 50,
  chutney: 30,
  salad: 40,
};

export const pricing = (prices: Record<string, number | null> = PRICES): MenuPricing => ({
  dishPrice: (d) => prices[d.id] ?? null,
  optionPrice: (o) => prices[o.optionId] ?? null,
});

export const CATEGORIES: CatalogueCategory[] = [
  {
    id: 'desserts',
    name: 'Desserts',
    slug: 'desserts',
    sortOrder: 3,
    isActive: true,
    isSecret: false,
    items: [{ menuItemId: 'mi-jamun', sortOrder: 1, isActive: true, dish: GULAB_JAMUN }],
  },
  {
    id: 'bowls',
    name: 'Bowls',
    slug: 'bowls',
    sortOrder: 1,
    isActive: true,
    isSecret: false,
    items: [{ menuItemId: 'mi-bowl', sortOrder: 1, isActive: true, dish: PANEER_BOWL }],
  },
  {
    id: 'chefs',
    name: "Chef's Table",
    slug: 'chefs-table',
    sortOrder: 9,
    isActive: true,
    isSecret: true,
    items: [{ menuItemId: 'mi-biryani', sortOrder: 1, isActive: true, dish: BIRYANI_HANDI }],
  },
];

export const NO_HIDING = { hiddenCategoryIds: new Set<string>(), hiddenMenuItemIds: new Set<string>() };
