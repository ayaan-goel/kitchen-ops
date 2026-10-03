/**
 * Planned kitchen/dispatch times, late/at-risk status and on-time delivery
 * (KIT-08…10, DSP-09, A-25, A-26, A-29). Pure functions over instants.
 */

const MINUTE = 60_000;

export interface PlannedTimes {
  plannedDispatchReadyAt: Date;
  plannedKitchenReadyAt: Date;
}

/** dispatch-ready = delivery − company lead minutes; kitchen-ready = dispatch-ready − kitchen buffer (30). */
export function plannedTimes(deliveryAt: Date, leadMinutes: number, bufferMinutes: number): PlannedTimes {
  const plannedDispatchReadyAt = new Date(deliveryAt.getTime() - leadMinutes * MINUTE);
  const plannedKitchenReadyAt = new Date(plannedDispatchReadyAt.getTime() - bufferMinutes * MINUTE);
  return { plannedDispatchReadyAt, plannedKitchenReadyAt };
}

export type RiskStatus = 'DONE' | 'LATE' | 'AT_RISK' | 'OK';

function riskFor(deadline: Date, now: Date, atRiskMinutes: number): RiskStatus {
  if (now.getTime() >= deadline.getTime()) return 'LATE';
  if (now.getTime() >= deadline.getTime() - atRiskMinutes * MINUTE) return 'AT_RISK';
  return 'OK';
}

/** A prep unit is late once now ≥ planned kitchen-ready, at risk inside the window before it. */
export function unitRisk(
  doneAt: Date | null,
  plannedKitchenReadyAt: Date,
  now: Date,
  atRiskMinutes: number,
): RiskStatus {
  if (doneAt) return 'DONE';
  return riskFor(plannedKitchenReadyAt, now, atRiskMinutes);
}

export type DropStage = 'PENDING' | 'DISPATCH_READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED';

/** A drop is late once it hasn't left by its planned dispatch-ready time. */
export function dropRisk(
  stage: DropStage,
  plannedDispatchReadyAt: Date,
  now: Date,
  atRiskMinutes: number,
): RiskStatus {
  if (stage === 'OUT_FOR_DELIVERY' || stage === 'DELIVERED') return 'DONE';
  return riskFor(plannedDispatchReadyAt, now, atRiskMinutes);
}

/** On time = delivered at or before the scheduled delivery time plus the grace period. */
export function isOnTime(deliveredAt: Date, deliveryAt: Date, graceMinutes: number): boolean {
  return deliveredAt.getTime() <= deliveryAt.getTime() + graceMinutes * MINUTE;
}
