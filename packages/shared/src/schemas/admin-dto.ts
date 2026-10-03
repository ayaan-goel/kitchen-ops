import { z } from 'zod';
import { calendarDateSchema, paginationQuerySchema, timeOfDaySchema, uuidSchema } from './common';

/** Companies, employees, staff and platform settings (TRD §6.1, §6.6, §6.7, §6.15). */

const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1, 'Required').max(max);
const weekdays = z.array(z.number().int().min(1).max(7)).max(7).refine((d) => new Set(d).size === d.length, 'A day is listed twice');
const email = z.string().trim().toLowerCase().email('Enter a valid email');

// ─── companies ───

export const companyCreateSchema = z.object({
  name: required(120),
  billingContactName: required(120),
  billingEmail: email,
  domain: z.string().trim().min(3).max(120),
});
export type CompanyCreateInput = z.input<typeof companyCreateSchema>;

export const companyUpdateSchema = z.object({
  name: required(120),
  billingContactName: required(120),
  billingEmail: email,
  billingPhone: text(40).nullable().default(null),
  billingAddress: text(300).default(''),
  priceTierId: uuidSchema.nullable(),
  ownerEmployeeId: uuidSchema.nullable(),
  workingDays: weekdays.min(1, 'Pick at least one working day'),
  defaultDeliveryTime: timeOfDaySchema,
  dispatchLeadMinutes: z.number().int().min(0).max(480),
  defaultPackagingTypeId: uuidSchema,
  driverInstructions: text(500).default(''),
  defaultDriverId: uuidSchema.nullable(),
});
export type CompanyUpdateInput = z.input<typeof companyUpdateSchema>;

export const domainInputSchema = z.object({ domain: z.string().trim().min(3).max(120) });

export const addressInputSchema = z.object({
  label: required(120),
  line1: required(200),
  line2: text(200).nullable().default(null),
  city: required(80),
  state: text(80).nullable().default(null),
  postalCode: required(20),
  deliveryNotes: text(500).default(''),
  isActive: z.boolean().default(true),
  makeDefault: z.boolean().default(false),
});
export type AddressInput = z.input<typeof addressInputSchema>;

export const holidayInputSchema = z.object({ date: calendarDateSchema, name: required(80) });

export const menuVisibilitySchema = z.object({
  hiddenCategoryIds: z.array(uuidSchema).max(200).default([]),
  hiddenMenuItemIds: z.array(uuidSchema).max(1000).default([]),
});

export interface CompanyListItemDto {
  id: string;
  name: string;
  tierName: string;
  usesDefaultTier: boolean;
  domains: string[];
  employees: number;
  ownerName: string | null;
  defaultDriverName: string | null;
  workingDays: number[];
}

export interface CompanyDetailDto {
  id: string;
  name: string;
  billingContactName: string;
  billingEmail: string;
  billingPhone: string | null;
  billingAddress: string;
  priceTierId: string | null;
  ownerEmployeeId: string | null;
  ownerName: string | null;
  workingDays: number[];
  defaultDeliveryTime: string;
  dispatchLeadMinutes: number;
  defaultPackagingTypeId: string;
  driverInstructions: string;
  defaultDriverId: string | null;
  defaultAddressId: string | null;
  domains: { id: string; domain: string; employees: number }[];
  addresses: {
    id: string;
    label: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string | null;
    postalCode: string;
    deliveryNotes: string;
    isActive: boolean;
    isDefault: boolean;
  }[];
  holidays: { id: string; date: string; name: string }[];
  hiddenCategoryIds: string[];
  hiddenMenuItemIds: string[];
  employees: number;
}

// ─── employees ───

export const employeeListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  companyId: uuidSchema.optional(),
});
export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;

export const employeeInputSchema = z.object({
  companyId: uuidSchema,
  name: required(120),
  email,
  phone: text(40).nullable().default(null),
  canChooseAddress: z.boolean().default(false),
  canChangeDeliveryTime: z.boolean().default(false),
  canChangePackaging: z.boolean().default(false),
  allergenIds: z.array(uuidSchema).max(50).default([]),
  dietaryTagIds: z.array(uuidSchema).max(50).default([]),
});
export type EmployeeInput = z.input<typeof employeeInputSchema>;

export const employeeMoveSchema = z.object({ companyId: uuidSchema, email });

export interface EmployeeListItemDto {
  id: string;
  name: string;
  email: string;
  company: { id: string; name: string };
  isOwner: boolean;
  flags: { address: boolean; time: boolean; packaging: boolean };
  allergies: number;
}

export interface EmployeeDetailDto {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  email: string;
  phone: string | null;
  canChooseAddress: boolean;
  canChangeDeliveryTime: boolean;
  canChangePackaging: boolean;
  allergenIds: string[];
  dietaryTagIds: string[];
  isOwner: boolean;
  orderCount: number;
  /** Draft/placed orders; after a move they stay with the old company and can only be cancelled (A-18). */
  openOrders: { id: string; number: number; deliveryDate: string; status: string; companyName: string }[];
}

export interface EmployeeImportReportDto {
  dryRun: boolean;
  total: number;
  valid: number;
  invalid: number;
  created: number;
  rows: { row: number; email: string; errors: { column: string; message: string }[] }[];
}

// ─── staff ───

export const staffCreateSchema = z.object({
  name: required(120),
  email,
  phone: text(40).nullable().default(null),
  roleId: uuidSchema,
  password: z.string().min(8, 'At least 8 characters').max(200),
});
export type StaffCreateInput = z.input<typeof staffCreateSchema>;

export const staffUpdateSchema = z.object({
  name: required(120).optional(),
  phone: text(40).nullable().optional(),
  roleId: uuidSchema.optional(),
  isActive: z.boolean().optional(),
});

export const staffPasswordSchema = z.object({ password: z.string().min(8, 'At least 8 characters').max(200) });

export interface StaffDto {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: { id: string; name: string };
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface RoleDto {
  id: string;
  key: string;
  name: string;
  description: string;
  permissions: string[];
  staff: number;
}

// ─── settings ───

export const settingsUpdateSchema = z
  .object({
    kitchenWorkingDays: weekdays.min(1, 'Pick at least one working day'),
    cutoffTime: timeOfDaySchema,
    cutoffDaysBefore: z.number().int().min(0).max(14),
    kitchenBufferMinutes: z.number().int().min(0).max(240),
    atRiskMinutes: z.number().int().min(0).max(240),
    onTimeGraceMinutes: z.number().int().min(0).max(120),
    deliveryWindowStart: timeOfDaySchema,
    deliveryWindowEnd: timeOfDaySchema,
    publicEmailDomains: z.array(z.string().trim().toLowerCase().min(3).max(120)).max(200),
  })
  .refine((s) => s.deliveryWindowStart < s.deliveryWindowEnd, { message: 'The window must start before it ends', path: ['deliveryWindowEnd'] });
export type SettingsUpdateInput = z.input<typeof settingsUpdateSchema>;

export interface SettingsDto {
  kitchenTimeZone: string;
  kitchenWorkingDays: number[];
  cutoffTime: string;
  cutoffDaysBefore: number;
  kitchenBufferMinutes: number;
  atRiskMinutes: number;
  onTimeGraceMinutes: number;
  deliveryWindowStart: string;
  deliveryWindowEnd: string;
  defaultPriceTier: { id: string; name: string };
  publicEmailDomains: string[];
  holidays: { id: string; date: string; name: string }[];
  updatedAt: string;
  updatedBy: string | null;
}

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
