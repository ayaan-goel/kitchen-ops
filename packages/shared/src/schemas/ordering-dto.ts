import type { OrderStatus } from './orders';

/** Response shapes of the ordering and cut-off APIs (TRD §6.8, §6.9). Money in cents, times "HH:mm". */

export type DeliveryDayStatusDto =
  | 'OK'
  | 'KITCHEN_CLOSED'
  | 'KITCHEN_HOLIDAY'
  | 'COMPANY_CLOSED'
  | 'COMPANY_HOLIDAY';

export interface CalendarDayDto {
  date: string;
  status: DeliveryDayStatusDto;
  cutoffAt: string;
  locked: boolean;
}

export interface OrderingContextDto {
  employee: {
    id: string;
    name: string;
    email: string;
    canChooseAddress: boolean;
    canChangeDeliveryTime: boolean;
    canChangePackaging: boolean;
    allergens: string[];
    dietaryPreferences: string[];
  };
  company: { id: string; name: string; tierName: string; defaultDeliveryTime: string; dispatchLeadMinutes: number };
  addresses: { id: string; label: string; text: string; isDefault: boolean }[];
  packagingTypes: { id: string; name: string; isDefault: boolean }[];
  deliveryWindow: { start: string; end: string; stepMinutes: number };
  today: string;
}

export interface MenuOptionDto {
  optionId: string;
  name: string;
  priceCents: number;
  allergens: string[];
  portions: { portionSizeId: string; name: string; extraCents: number }[];
}

export interface MenuGroupDto {
  id: string;
  name: string;
  isRequired: boolean;
  maxSelections: number;
  usesPortions: boolean;
  options: MenuOptionDto[];
}

export interface MenuDishDto {
  id: string;
  sku: string;
  name: string;
  description: string;
  imageUrl: string | null;
  temperature: 'HOT' | 'COLD';
  priceCents: number;
  minOrderQty: number | null;
  allergens: string[];
  dietaryTags: string[];
  groups: MenuGroupDto[];
}

export interface MenuCategoryDto {
  id: string;
  name: string;
  slug: string;
  isSecret: boolean;
  items: { menuItemId: string; dish: MenuDishDto }[];
}

export interface EmployeeMenuDto {
  tier: { id: string; name: string; isDefault: boolean };
  listed: MenuCategoryDto[];
  secret: MenuCategoryDto[];
  excluded: { kind: 'CATEGORY' | 'ITEM'; name: string; category: string; reason: string }[];
}

export interface EmployeeSearchItemDto {
  id: string;
  name: string;
  email: string;
  companyId: string;
  companyName: string;
}

export interface OrderListItemDto {
  id: string;
  number: number;
  status: OrderStatus;
  deliveryDate: string;
  deliveryTime: string;
  company: { id: string; name: string };
  employee: { id: string; name: string };
  totalCents: number;
  boxes: number;
  invoiced: boolean;
  kitchenReady: boolean;
}

export interface OrderSelectionDto {
  groupName: string;
  optionName: string;
  portionName: string | null;
  optionUnitPriceCents: number;
  portionExtraCents: number;
}

export interface OrderCombinationDto {
  id: string;
  quantity: number;
  label: string;
  unitPriceCents: number;
  totalCents: number;
  kitchenStartedAt: string | null;
  kitchenDoneAt: string | null;
  selections: (OrderSelectionDto & { groupId: string | null; optionId: string; portionSizeId: string | null })[];
}

export interface OrderLineDto {
  id: string;
  dishId: string;
  dishName: string;
  dishSku: string;
  quantity: number;
  dishUnitPriceCents: number;
  lineTotalCents: number;
  combinations: OrderCombinationDto[];
}

export interface OrderEventDto {
  id: string;
  type: string;
  at: string;
  actor: string | null;
  data: unknown;
}

export interface OrderDetailDto {
  id: string;
  number: number;
  status: OrderStatus;
  version: number;
  deliveryDate: string;
  deliveryTime: string;
  deliveryAt: string;
  cutoffAt: string;
  locked: boolean;
  employee: { id: string; name: string; email: string };
  company: { id: string; name: string };
  tierName: string;
  address: { id: string; label: string; text: string };
  packagingType: { id: string; name: string };
  notes: string;
  totalCents: number;
  statusReason: string | null;
  plannedKitchenReadyAt: string;
  plannedDispatchReadyAt: string;
  kitchenStartedAt: string | null;
  kitchenReadyAt: string | null;
  kitchenForced: boolean;
  drop: { id: string; stage: string; driverName: string | null } | null;
  invoice: { id: string; number: number; status: string } | null;
  adjustments: { id: string; amountCents: number; reason: string; note: string; invoiced: boolean }[];
  lines: OrderLineDto[];
  events: OrderEventDto[];
  createdBy: string | null;
  createdAt: string;
}

export interface OrderWriteResultDto {
  order: OrderDetailDto;
  warnings: { path: (string | number)[]; message: string }[];
}

export interface CutoffDayDto {
  date: string;
  cutoffAt: string;
  /** OPEN: before cut-off · DUE: passed, orders still to process · PROCESSED: run recorded · LOCKED: passed, nothing to process */
  state: 'OPEN' | 'DUE' | 'PROCESSED' | 'LOCKED';
  counts: { draft: number; placed: number; confirmed: number };
  lastRun: { at: string; runCount: number; trigger: string } | null;
}

export interface CutoffRunResultDto {
  date: string;
  confirmed: number;
  cancelled: number;
  runCount: number;
}
