import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common';

/** Catalogue, pricing and menu admin (TRD §6.2–§6.5). Money is integer cents. */

const cents = z.number().int('Use whole cents').min(0, 'Can’t be negative').max(10_000_000, 'That is too large');
const name = z.string().trim().min(1, 'Required').max(120);
const ids = z.array(uuidSchema).max(200).default([]);

// ─── reference data ───

export const REFERENCE_KINDS = ['allergens', 'dietary-tags', 'stations', 'portion-sizes', 'packaging-types'] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];
export const REFERENCE_KIND_LABELS: Record<ReferenceKind, string> = {
  allergens: 'Allergens',
  'dietary-tags': 'Dietary tags',
  stations: 'Kitchen stations',
  'portion-sizes': 'Portion sizes',
  'packaging-types': 'Packaging types',
};

export const referenceCreateSchema = z.object({ name, description: z.string().trim().max(300).optional() });
export const referenceUpdateSchema = z.object({
  name: name.optional(),
  description: z.string().trim().max(300).optional(),
  isActive: z.boolean().optional(),
});
export const reorderSchema = z.object({ ids: z.array(uuidSchema).min(1).max(500) });
export type ReorderInput = z.infer<typeof reorderSchema>;

export interface ReferenceItemDto {
  id: string;
  name: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
  /** How many dishes/options/employees/companies use it (deactivate, never delete). */
  usage: number;
}

// ─── options ───

export const optionInputSchema = z.object({
  name,
  description: z.string().trim().max(500).default(''),
  costCents: cents,
  isActive: z.boolean().default(true),
  allergenIds: ids,
  dietaryTagIds: ids,
  portions: z.array(z.object({ portionSizeId: uuidSchema, extraCents: cents })).max(20).default([]),
});
export type OptionInput = z.infer<typeof optionInputSchema>;

export interface OptionDto {
  id: string;
  name: string;
  description: string;
  costCents: number;
  isActive: boolean;
  allergenIds: string[];
  dietaryTagIds: string[];
  portions: { portionSizeId: string; extraCents: number }[];
  /** Dishes whose option groups include it. */
  usedByDishes: number;
}

// ─── dishes ───

export const dishInputSchema = z.object({
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,29}$/, 'Letters, digits and dashes, e.g. FL-BWL-001'),
  name,
  description: z.string().trim().max(1000).default(''),
  imageUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || /^https:\/\/\S+$/.test(v), 'Use an https:// link')
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null),
  temperature: z.enum(['HOT', 'COLD']),
  costCents: cents,
  stationId: uuidSchema.nullable().default(null),
  minOrderQty: z.number().int().min(1).max(500).nullable().default(null),
  isActive: z.boolean().default(true),
  allergenIds: ids,
  dietaryTagIds: ids,
});
export type DishInput = z.input<typeof dishInputSchema>;
export type DishInputParsed = z.infer<typeof dishInputSchema>;

export const dishListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  stationId: z.string().optional(), // uuid or "none"
  active: z.enum(['true', 'false']).optional(),
});
export type DishListQuery = z.infer<typeof dishListQuerySchema>;

export const optionGroupsInputSchema = z.object({
  groups: z
    .array(
      z.object({
        id: uuidSchema.optional(),
        name: z.string().trim().max(80),
        isRequired: z.boolean(),
        maxSelections: z.number().int(),
        usesPortions: z.boolean(),
        optionIds: z.array(uuidSchema).max(50),
        portionSizeIds: z.array(uuidSchema).max(10).default([]),
      }),
    )
    .max(15),
});
export type OptionGroupsInput = z.input<typeof optionGroupsInputSchema>;

export interface DishListItemDto {
  id: string;
  sku: string;
  name: string;
  temperature: 'HOT' | 'COLD';
  costCents: number;
  stationName: string | null;
  isActive: boolean;
  imageUrl: string | null;
  groupCount: number;
  menuPlacements: number;
}

export interface DishDetailDto extends Omit<DishListItemDto, 'stationName' | 'groupCount' | 'menuPlacements'> {
  description: string;
  stationId: string | null;
  minOrderQty: number | null;
  allergenIds: string[];
  dietaryTagIds: string[];
  groups: {
    id: string;
    name: string;
    isRequired: boolean;
    maxSelections: number;
    usesPortions: boolean;
    optionIds: string[];
    portionSizeIds: string[];
  }[];
  menuCategories: { id: string; name: string }[];
}

// ─── pricing ───

export const tierInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).default(''),
  derivation: z.enum(['MANUAL', 'FROM_COST', 'FROM_TIER']),
  baseTierId: uuidSchema.nullable().default(null),
  multiplierBps: z.number().int().positive().max(1_000_000).nullable().default(null),
});
export type TierInput = z.input<typeof tierInputSchema>;

export interface PriceTierDto {
  id: string;
  name: string;
  description: string;
  derivation: 'MANUAL' | 'FROM_COST' | 'FROM_TIER';
  baseTierId: string | null;
  baseTierName: string | null;
  multiplierBps: number | null;
  isDefault: boolean;
  companies: number;
  /** Active dishes / options without an effective price on this tier. */
  missingDishes: number;
  missingOptions: number;
}

export const priceSetSchema = z.object({
  kind: z.enum(['dishes', 'options']),
  itemId: uuidSchema,
  /** null clears the explicit price (a derived tier falls back to its rule). */
  priceCents: cents.nullable(),
});
export type PriceSetInput = z.infer<typeof priceSetSchema>;

export interface TierGridRowDto {
  itemId: string;
  name: string;
  sku: string | null;
  isActive: boolean;
  costCents: number;
  explicitCents: number | null;
  derivedCents: number | null;
  effectiveCents: number | null;
  source: 'EXPLICIT' | 'OVERRIDE' | 'DERIVED' | 'MISSING';
}

export interface TierGridDto {
  tier: PriceTierDto;
  kind: 'dishes' | 'options';
  rows: TierGridRowDto[];
}

// ─── menu ───

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lower-case words separated by dashes'),
  description: z.string().trim().max(300).default(''),
  isActive: z.boolean().default(true),
  isSecret: z.boolean().default(false),
});
export type CategoryInput = z.input<typeof categoryInputSchema>;

export const menuItemCreateSchema = z.object({ dishId: uuidSchema });
export const menuItemUpdateSchema = z.object({ isActive: z.boolean() });

export interface MenuAdminCategoryDto {
  id: string;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  isSecret: boolean;
  hiddenForCompanies: number;
  items: { id: string; dishId: string; dishName: string; sku: string; dishActive: boolean; isActive: boolean; sortOrder: number }[];
}
