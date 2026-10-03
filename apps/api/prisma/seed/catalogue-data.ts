/**
 * Seed data: a realistic Indian corporate-lunch catalogue (money in cents, USD per A-01).
 * Standard-tier prices are the "list" prices; other tiers derive from them (see seed.ts).
 */

export const ALLERGENS = ['Dairy', 'Gluten', 'Tree nuts', 'Peanuts', 'Soy', 'Sesame', 'Egg', 'Mustard'] as const;
export const DIETARY_TAGS = ['Vegetarian', 'Vegan', 'Jain', 'Gluten-free', 'Dairy-free', 'High-protein'] as const;
export const STATIONS = ['Tandoor', 'Curry & Rice', 'Grill', 'Cold Prep', 'Breakfast', 'Desserts', 'Beverages'] as const;
export const PORTION_SIZES = ['Regular', 'Large'] as const;
export const PACKAGING_TYPES = [
  { name: 'Standard box', description: 'Sealed single-meal box' },
  { name: 'Eco compostable box', description: 'Bagasse box, compostable' },
  { name: 'Insulated hot bag', description: 'For long transfers; keeps food above 60°C' },
  { name: 'Name-labelled box', description: 'Each box labelled with the employee name' },
] as const;

type Allergen = (typeof ALLERGENS)[number];
type Tag = (typeof DIETARY_TAGS)[number];
type Station = (typeof STATIONS)[number];

export interface OptionSeed {
  name: string;
  costCents: number;
  priceCents: number; // Standard tier
  allergens: Allergen[];
  tags: Tag[];
  /** Portion surcharges (A-11), required when the option sits in a portion group. */
  portions?: { Regular: number; Large: number };
}

const VEG: Tag[] = ['Vegetarian'];
const VEGAN: Tag[] = ['Vegetarian', 'Vegan', 'Dairy-free'];
const VEGAN_GF: Tag[] = [...VEGAN, 'Gluten-free'];

export const OPTIONS: OptionSeed[] = [
  // proteins
  { name: 'Paneer', costCents: 60, priceCents: 80, allergens: ['Dairy'], tags: [...VEG, 'Gluten-free', 'High-protein'] },
  { name: 'Tofu', costCents: 50, priceCents: 60, allergens: ['Soy'], tags: [...VEGAN_GF, 'High-protein'] },
  { name: 'Chickpeas', costCents: 20, priceCents: 30, allergens: [], tags: [...VEGAN_GF, 'Jain', 'High-protein'] },
  // rice (portion-sized)
  { name: 'Jeera rice', costCents: 20, priceCents: 0, allergens: [], tags: [...VEGAN_GF, 'Jain'], portions: { Regular: 0, Large: 100 } },
  { name: 'Brown rice', costCents: 30, priceCents: 40, allergens: [], tags: [...VEGAN_GF, 'Jain'], portions: { Regular: 0, Large: 120 } },
  { name: 'Steamed basmati', costCents: 15, priceCents: 0, allergens: [], tags: [...VEGAN_GF, 'Jain'], portions: { Regular: 0, Large: 90 } },
  // breads
  { name: 'Butter naan', costCents: 15, priceCents: 40, allergens: ['Gluten', 'Dairy'], tags: [...VEG, 'Jain'] },
  { name: 'Tandoori roti', costCents: 8, priceCents: 25, allergens: ['Gluten'], tags: [...VEGAN, 'Jain'] },
  { name: 'Lachha paratha', costCents: 18, priceCents: 45, allergens: ['Gluten', 'Dairy'], tags: [...VEG, 'Jain'] },
  // sides
  { name: 'Raita', costCents: 20, priceCents: 50, allergens: ['Dairy'], tags: [...VEG, 'Gluten-free'] },
  { name: 'Mint chutney', costCents: 5, priceCents: 30, allergens: [], tags: [...VEGAN_GF, 'Jain'] },
  { name: 'Kachumber salad', costCents: 15, priceCents: 40, allergens: [], tags: [...VEGAN_GF] },
  { name: 'Roasted papad', costCents: 5, priceCents: 20, allergens: [], tags: [...VEGAN_GF, 'Jain'] },
  // spice level (free choices that must still be chosen, A-13)
  { name: 'Mild', costCents: 0, priceCents: 0, allergens: [], tags: [...VEGAN_GF, 'Jain'] },
  { name: 'Medium', costCents: 0, priceCents: 0, allergens: [], tags: [...VEGAN_GF, 'Jain'] },
  { name: 'Spicy', costCents: 0, priceCents: 0, allergens: [], tags: [...VEGAN_GF, 'Jain'] },
  // sweetness / style
  { name: 'Regular sugar', costCents: 2, priceCents: 0, allergens: [], tags: [...VEGAN_GF, 'Jain'] },
  { name: 'Less sugar', costCents: 1, priceCents: 0, allergens: [], tags: [...VEGAN_GF, 'Jain'] },
  { name: 'No sugar', costCents: 0, priceCents: 0, allergens: [], tags: [...VEGAN_GF, 'Jain'] },
  { name: 'Sweet', costCents: 2, priceCents: 0, allergens: [], tags: [...VEGAN_GF, 'Jain'] },
  { name: 'Salted', costCents: 1, priceCents: 0, allergens: [], tags: [...VEGAN_GF, 'Jain'] },
];

export interface GroupSeed {
  name: string;
  isRequired: boolean;
  maxSelections?: number;
  usesPortions?: boolean;
  options: string[];
}

const PROTEIN: GroupSeed = { name: 'Choose your protein', isRequired: true, options: ['Paneer', 'Tofu', 'Chickpeas'] };
const RICE: GroupSeed = {
  name: 'Choose your rice',
  isRequired: true,
  usesPortions: true,
  options: ['Jeera rice', 'Brown rice', 'Steamed basmati'],
};
const BREAD: GroupSeed = { name: 'Choose your bread', isRequired: true, options: ['Butter naan', 'Tandoori roti', 'Lachha paratha'] };
const SIDES: GroupSeed = {
  name: 'Add sides',
  isRequired: false,
  maxSelections: 2,
  options: ['Raita', 'Mint chutney', 'Kachumber salad', 'Roasted papad'],
};
const SPICE: GroupSeed = { name: 'Spice level', isRequired: true, options: ['Mild', 'Medium', 'Spicy'] };
const SUGAR: GroupSeed = { name: 'Sweetness', isRequired: true, options: ['Regular sugar', 'Less sugar', 'No sugar'] };
const SODA: GroupSeed = { name: 'Style', isRequired: true, options: ['Sweet', 'Salted'] };

export interface DishSeed {
  sku: string;
  name: string;
  description: string;
  station: Station | null;
  temperature: 'HOT' | 'COLD';
  costCents: number;
  priceCents: number; // Standard tier
  allergens: Allergen[];
  tags: Tag[];
  minOrderQty?: number;
  groups: GroupSeed[];
  category: CategorySlug;
}

export type CategorySlug =
  | 'bowls'
  | 'thalis'
  | 'wraps-rolls'
  | 'breakfast'
  | 'salads'
  | 'desserts'
  | 'beverages'
  | 'chefs-table';

export const CATEGORIES: { slug: CategorySlug; name: string; description: string; isSecret?: boolean }[] = [
  { slug: 'bowls', name: 'Bowls', description: 'Build-your-own rice bowls' },
  { slug: 'thalis', name: 'Thalis', description: 'Complete meals on one plate' },
  { slug: 'wraps-rolls', name: 'Wraps & Rolls', description: 'Kathi rolls and wraps' },
  { slug: 'breakfast', name: 'Breakfast', description: 'South and North Indian breakfasts' },
  { slug: 'salads', name: 'Salads', description: 'Light and fresh' },
  { slug: 'desserts', name: 'Desserts', description: 'Something sweet' },
  { slug: 'beverages', name: 'Beverages', description: 'Hot and cold drinks' },
  { slug: 'chefs-table', name: "Chef's Table", description: 'Hyderabadi specials — by link only', isSecret: true },
];

export const DISHES: DishSeed[] = [
  // Bowls
  { sku: 'FL-BWL-001', name: 'Paneer Tikka Rice Bowl', description: 'Tandoor-charred paneer tikka over rice with makhani gravy.', station: 'Curry & Rice', temperature: 'HOT', costCents: 210, priceCents: 650, allergens: ['Dairy'], tags: ['Vegetarian', 'Gluten-free', 'High-protein'], groups: [PROTEIN, RICE, SIDES, SPICE], category: 'bowls' },
  { sku: 'FL-BWL-002', name: 'Chicken Tikka Rice Bowl', description: 'Smoky chicken tikka, onion salad and rice.', station: 'Tandoor', temperature: 'HOT', costCents: 260, priceCents: 750, allergens: ['Dairy'], tags: ['Gluten-free', 'High-protein'], groups: [RICE, SIDES, SPICE], category: 'bowls' },
  { sku: 'FL-BWL-003', name: 'Rajma Chawal Bowl', description: 'Slow-cooked kidney beans with rice.', station: 'Curry & Rice', temperature: 'HOT', costCents: 140, priceCents: 480, allergens: [], tags: ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free'], groups: [RICE, SIDES], category: 'bowls' },
  { sku: 'FL-BWL-004', name: 'Chole Bowl', description: 'Punjabi chickpea curry with your choice of bread.', station: 'Curry & Rice', temperature: 'HOT', costCents: 140, priceCents: 480, allergens: [], tags: ['Vegetarian', 'Vegan', 'Dairy-free'], groups: [BREAD, SIDES, SPICE], category: 'bowls' },
  { sku: 'FL-BWL-005', name: 'Teriyaki Tofu Bowl', description: 'Glazed tofu, sesame greens and rice.', station: 'Grill', temperature: 'HOT', costCents: 220, priceCents: 620, allergens: ['Soy', 'Sesame'], tags: ['Vegetarian', 'Vegan', 'Dairy-free'], groups: [RICE], category: 'bowls' },
  { sku: 'FL-BWL-006', name: 'Dal Makhani Bowl', description: 'Black lentils simmered overnight, butter finish.', station: 'Curry & Rice', temperature: 'HOT', costCents: 150, priceCents: 520, allergens: ['Dairy'], tags: ['Vegetarian', 'Gluten-free'], groups: [RICE, SIDES], category: 'bowls' },
  // Thalis
  { sku: 'FL-THL-001', name: 'Veg Thali', description: 'Dal, two sabzis, rice, bread, salad and dessert.', station: 'Curry & Rice', temperature: 'HOT', costCents: 260, priceCents: 820, allergens: ['Dairy', 'Gluten'], tags: ['Vegetarian'], groups: [BREAD, SPICE], category: 'thalis' },
  { sku: 'FL-THL-002', name: 'Jain Thali', description: 'No onion, garlic or root vegetables.', station: 'Curry & Rice', temperature: 'HOT', costCents: 260, priceCents: 820, allergens: ['Dairy', 'Gluten'], tags: ['Vegetarian', 'Jain'], groups: [BREAD], category: 'thalis' },
  { sku: 'FL-THL-003', name: 'Mini Non-veg Thali', description: 'Chicken curry, dal, rice, bread and salad.', station: 'Curry & Rice', temperature: 'HOT', costCents: 320, priceCents: 950, allergens: ['Dairy', 'Gluten'], tags: [], groups: [BREAD, SPICE], category: 'thalis' },
  // Wraps & Rolls
  { sku: 'FL-WRP-001', name: 'Paneer Kathi Roll', description: 'Paneer tikka, onions and mint chutney in a flaky paratha.', station: 'Grill', temperature: 'HOT', costCents: 150, priceCents: 450, allergens: ['Dairy', 'Gluten'], tags: ['Vegetarian'], groups: [SPICE, SIDES], category: 'wraps-rolls' },
  { sku: 'FL-WRP-002', name: 'Chicken Kathi Roll', description: 'Egg-washed paratha with chicken tikka.', station: 'Grill', temperature: 'HOT', costCents: 180, priceCents: 520, allergens: ['Gluten', 'Egg'], tags: [], groups: [SPICE], category: 'wraps-rolls' },
  { sku: 'FL-WRP-003', name: 'Falafel Wrap', description: 'Falafel, hummus and pickled veg.', station: 'Grill', temperature: 'HOT', costCents: 140, priceCents: 450, allergens: ['Gluten', 'Sesame'], tags: ['Vegetarian', 'Vegan', 'Dairy-free'], groups: [], category: 'wraps-rolls' },
  // Breakfast
  { sku: 'FL-BRK-001', name: 'Poha', description: 'Flattened rice with peanuts, curry leaves and lemon.', station: 'Breakfast', temperature: 'HOT', costCents: 60, priceCents: 250, allergens: ['Peanuts'], tags: ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free'], groups: [], category: 'breakfast' },
  { sku: 'FL-BRK-002', name: 'Upma', description: 'Semolina with vegetables and mustard seeds.', station: 'Breakfast', temperature: 'HOT', costCents: 60, priceCents: 250, allergens: ['Gluten', 'Mustard'], tags: ['Vegetarian'], groups: [], category: 'breakfast' },
  { sku: 'FL-BRK-003', name: 'Idli Sambar Box', description: 'Four idlis, sambar and coconut chutney.', station: 'Breakfast', temperature: 'HOT', costCents: 80, priceCents: 300, allergens: ['Mustard'], tags: ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free'], groups: [], category: 'breakfast' },
  { sku: 'FL-BRK-004', name: 'Masala Dosa Box', description: 'Crisp dosa with potato masala, sambar and chutney.', station: 'Breakfast', temperature: 'HOT', costCents: 110, priceCents: 380, allergens: ['Mustard'], tags: ['Vegetarian', 'Gluten-free'], groups: [], category: 'breakfast' },
  { sku: 'FL-BRK-005', name: 'Aloo Paratha with Curd', description: 'Two stuffed parathas, curd and pickle.', station: 'Breakfast', temperature: 'HOT', costCents: 100, priceCents: 350, allergens: ['Gluten', 'Dairy'], tags: ['Vegetarian'], groups: [], category: 'breakfast' },
  // Salads
  { sku: 'FL-SLD-001', name: 'Quinoa Chickpea Salad', description: 'Quinoa, chickpeas, cucumber and lemon dressing.', station: 'Cold Prep', temperature: 'COLD', costCents: 180, priceCents: 550, allergens: [], tags: ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'High-protein'], groups: [], category: 'salads' },
  { sku: 'FL-SLD-002', name: 'Sprouts Chaat Salad', description: 'Moong sprouts, pomegranate, chaat masala.', station: 'Cold Prep', temperature: 'COLD', costCents: 90, priceCents: 350, allergens: [], tags: ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free'], groups: [], category: 'salads' },
  // Desserts
  { sku: 'FL-DST-001', name: 'Gulab Jamun (2 pc)', description: 'Warm, in cardamom syrup.', station: 'Desserts', temperature: 'HOT', costCents: 40, priceCents: 180, allergens: ['Dairy', 'Gluten'], tags: ['Vegetarian'], groups: [], category: 'desserts' },
  { sku: 'FL-DST-002', name: 'Rasmalai', description: 'Soft cheese dumplings in saffron milk.', station: 'Desserts', temperature: 'COLD', costCents: 70, priceCents: 250, allergens: ['Dairy', 'Tree nuts'], tags: ['Vegetarian', 'Gluten-free'], groups: [], category: 'desserts' },
  { sku: 'FL-DST-003', name: 'Fruit Bowl', description: 'Seasonal cut fruit.', station: 'Cold Prep', temperature: 'COLD', costCents: 80, priceCents: 280, allergens: [], tags: ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Jain'], groups: [], category: 'desserts' },
  // Bought-in, no station → shows under "Unassigned" on the kitchen board (KIT-02).
  { sku: 'FL-DST-004', name: 'Chocolate Brownie', description: 'Bought-in walnut-free brownie.', station: null, temperature: 'COLD', costCents: 60, priceCents: 220, allergens: ['Gluten', 'Dairy', 'Egg'], tags: [], groups: [], category: 'desserts' },
  // Beverages
  { sku: 'FL-BEV-001', name: 'Masala Chai', description: 'Ginger-cardamom tea.', station: 'Beverages', temperature: 'HOT', costCents: 20, priceCents: 120, allergens: ['Dairy'], tags: ['Vegetarian', 'Gluten-free'], groups: [SUGAR], category: 'beverages' },
  { sku: 'FL-BEV-002', name: 'Cold Coffee', description: 'Blended, lightly sweet.', station: 'Beverages', temperature: 'COLD', costCents: 45, priceCents: 220, allergens: ['Dairy'], tags: ['Vegetarian', 'Gluten-free'], groups: [SUGAR], category: 'beverages' },
  { sku: 'FL-BEV-003', name: 'Fresh Lime Soda', description: 'Sweet or salted.', station: 'Beverages', temperature: 'COLD', costCents: 20, priceCents: 150, allergens: [], tags: ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Jain'], groups: [SODA], category: 'beverages' },
  { sku: 'FL-BEV-004', name: 'Chaas', description: 'Spiced buttermilk.', station: 'Beverages', temperature: 'COLD', costCents: 20, priceCents: 120, allergens: ['Dairy'], tags: ['Vegetarian', 'Gluten-free'], groups: [], category: 'beverages' },
  // Chef's Table (secret category)
  { sku: 'FL-CHF-001', name: 'Hyderabadi Veg Biryani', description: 'Dum-cooked biryani with saffron and fried onions.', station: 'Curry & Rice', temperature: 'HOT', costCents: 220, priceCents: 680, allergens: ['Dairy', 'Tree nuts'], tags: ['Vegetarian', 'Gluten-free'], groups: [SIDES], category: 'chefs-table' },
  { sku: 'FL-CHF-002', name: 'Hyderabadi Chicken Biryani Handi (serves 2)', description: 'Kacchi dum biryani in a sealed handi.', station: 'Curry & Rice', temperature: 'HOT', costCents: 520, priceCents: 1450, allergens: ['Dairy', 'Tree nuts'], tags: ['Gluten-free'], minOrderQty: 2, groups: [SIDES], category: 'chefs-table' },
  { sku: 'FL-CHF-003', name: 'Double ka Meetha', description: 'Hyderabadi bread pudding.', station: 'Desserts', temperature: 'COLD', costCents: 70, priceCents: 260, allergens: ['Dairy', 'Gluten', 'Tree nuts'], tags: ['Vegetarian'], groups: [], category: 'chefs-table' },
];

/** Startup tier is a manual price list that deliberately lacks some items (PRICE-05 demo). */
export const STARTUP_MISSING_DISHES = ['FL-BWL-002', 'FL-THL-003', 'FL-WRP-002', 'FL-CHF-002', 'FL-DST-002'];
export const STARTUP_MISSING_OPTIONS = ['Lachha paratha'];

/** Enterprise overrides on top of "Standard − 10%". */
export const ENTERPRISE_OVERRIDES: Record<string, number> = { 'FL-BEV-001': 100, 'FL-THL-001': 720 };
