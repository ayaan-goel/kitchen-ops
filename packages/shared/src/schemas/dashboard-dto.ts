import type { DashboardKind } from '../permissions';

/**
 * Role dashboards (PRD §8, TRD §6.16). Every figure is named after its PRD definition id so the
 * README, the query and the screen can be checked against each other.
 */

/** A ratio with its parts; `pct` is null when the denominator is 0 (shown as "—", never 0%). */
export interface Ratio {
  num: number;
  den: number;
  pct: number | null;
}

export interface StationLoadRow {
  station: string;
  units: number;
  boxes: number;
  notStarted: number;
  inProgress: number;
  done: number;
}

export interface AdminDashboardDto {
  kind: 'ADMIN';
  A1: { orders: number; boxes: number; bookedCents: number; cancelledOrRejected: number };
  A2: { units: Ratio; lateUnits: number };
  A3: { delivered: Ratio; onTime: Ratio };
  A4: { date: string; cutoffAt: string; placed: number; placedCents: number; drafts: number } | null;
  A5: { date: string; bookedCents: number; orders: number }[];
  A6: {
    unbilledCents: number;
    topUnbilled: { companyId: string; name: string; cents: number }[];
    outstandingCents: number;
    outstandingInvoices: number;
    oldestOutstanding: string | null;
  };
  A7: {
    missingPrices: { tierId: string; tier: string; dishes: number; options: number }[];
    companiesWithoutOwner: { id: string; name: string }[];
    companiesWithoutDriver: { id: string; name: string }[];
  };
}

export interface KitchenDashboardDto {
  kind: 'KITCHEN';
  K1: StationLoadRow[];
  K2: { readyBy: string; units: number; boxes: number }[];
  K3: { late: number; atRisk: number; lateBoxes: number; atRiskBoxes: number };
  K4: { dish: string; station: string; boxes: number; doneBoxes: number; topCombination: string }[];
  K5: { allergens: { name: string; units: number }[]; conflicts: number };
  K6: { date: string; provisional: boolean; stations: { station: string; units: number; boxes: number }[]; placedOrders: number };
}

export interface DispatchDashboardDto {
  kind: 'DISPATCH';
  D1: { waitingForKitchen: number; readyToDispatch: number; dispatchReady: number; outForDelivery: number; delivered: number };
  D2: { count: number; drops: { id: string; time: string; company: string }[] };
  D3: { late: number; atRisk: number; deliveredLate: number };
  D4: { driver: string; drops: number; remaining: number; boxes: number; nextDeparture: string | null }[];
  D5: { date: string; onTime: Ratio }[];
}

export interface DriverDashboardDto {
  kind: 'DRIVER';
  R1: {
    total: number;
    remaining: number;
    delivered: number;
    next: { id: string; time: string; company: string; address: string; boxes: number; instructions: string; stage: string } | null;
  };
  R2: { onTime: Ratio };
}

export type DashboardFiguresDto = AdminDashboardDto | KitchenDashboardDto | DispatchDashboardDto | DriverDashboardDto;

export type DashboardDto = DashboardFiguresDto & { generatedAt: string; today: string };

/** The dashboard a role lands on is data (`Role.dashboard`), never derived from the role name. */
export type DashboardKindDto = DashboardKind;
