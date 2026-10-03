import { z } from 'zod';
import { uuidSchema } from './common';
import type { RiskStatus } from './kitchen-dto';

/** Dispatch and driver API shapes (TRD §6.11–§6.13). */

export const DROP_STAGES = ['PENDING', 'DISPATCH_READY', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const;
export type DropStage = (typeof DROP_STAGES)[number];

export const assignDriverSchema = z.object({ driverId: uuidSchema.nullable() });
export type AssignDriverInput = z.infer<typeof assignDriverSchema>;

export const deliverDropSchema = z.object({
  note: z.string().trim().max(500, 'Keep the note under 500 characters').optional(),
  photoId: uuidSchema.optional(),
});
export type DeliverDropInput = z.infer<typeof deliverDropSchema>;

/** Delivery photos: compressed on the phone; the server re-checks type (magic bytes) and size. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface DropOrderDto {
  id: string;
  number: number;
  employeeName: string;
  boxes: number;
  status: 'CONFIRMED' | 'DELIVERED';
  plannedKitchenReadyAt: string;
  kitchenReadyAt: string | null;
  kitchenForced: boolean;
}

export interface DropDto {
  id: string;
  deliveryDate: string;
  deliveryTime: string;
  deliveryAt: string;
  stage: DropStage;
  company: { id: string; name: string };
  address: { id: string; label: string; text: string; notes: string };
  /** Company's standing driver instructions. */
  instructions: string;
  driver: { id: string; name: string; phone: string | null } | null;
  totalOrders: number;
  readyOrders: number;
  boxes: number;
  /** Earliest planned dispatch-ready time of the member orders. */
  plannedDispatchReadyAt: string;
  risk: RiskStatus;
  dispatchReadyAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
  deliveredOnTime: boolean | null;
  deliveredBy: string | null;
  deliveryNote: string | null;
  photoId: string | null;
  orders: DropOrderDto[];
}

export interface DispatchBoardDto {
  date: string;
  now: string;
  atRiskMinutes: number;
  drops: DropDto[];
}

export interface AssignableDriverDto {
  id: string;
  name: string;
  phone: string | null;
  /** Drops assigned to this driver on the board's date. */
  dropsOnDate: number;
  /** Of those, not delivered yet. */
  openDrops: number;
}

export interface DriverDayDto {
  date: string;
  now: string;
  drops: DropDto[];
}

export interface PhotoUploadDto {
  photoId: string;
}
