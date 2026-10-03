/** Kitchen board API shapes (TRD §6.10). */

export type UnitStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';
export type RiskStatus = 'DONE' | 'LATE' | 'AT_RISK' | 'OK';

export interface KitchenUnitDto {
  id: string;
  orderId: string;
  orderNumber: number;
  companyName: string;
  employeeName: string;
  dishName: string;
  temperature: 'HOT' | 'COLD';
  /** Option choices, e.g. "Paneer · Brown rice (Large)". Empty when the dish has no options. */
  label: string;
  quantity: number;
  stationId: string | null;
  allergens: string[];
  /** Allergens in this unit that the employee has declared (should be empty). */
  allergyConflicts: string[];
  deliveryTime: string;
  plannedKitchenReadyAt: string;
  startedAt: string | null;
  startedBy: string | null;
  doneAt: string | null;
  doneBy: string | null;
  status: UnitStatus;
  risk: RiskStatus;
}

export interface KitchenStationSummaryDto {
  id: string | null;
  name: string;
  units: number;
  boxes: number;
  notStarted: number;
  inProgress: number;
  done: number;
  late: number;
  atRisk: number;
}

export interface KitchenBoardDto {
  date: string;
  now: string;
  atRiskMinutes: number;
  stations: KitchenStationSummaryDto[];
  units: KitchenUnitDto[];
}

export interface KitchenSummaryDto {
  date: string;
  dishes: {
    dishId: string;
    dishName: string;
    stationName: string;
    temperature: 'HOT' | 'COLD';
    boxes: number;
    doneBoxes: number;
    combinations: { label: string; boxes: number }[];
  }[];
}

export interface UnitActionResultDto {
  unit: { id: string; status: UnitStatus; startedAt: string | null; doneAt: string | null };
  order: { id: string; kitchenStartedAt: string | null; kitchenReadyAt: string | null };
}
