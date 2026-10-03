import { describe, expect, it } from 'vitest';
import { zonedInstant } from './calendar';
import { dropRisk, isOnTime, plannedTimes, unitRisk } from './schedule';

const IST = 'Asia/Kolkata';
const deliveryAt = zonedInstant('2026-10-05', 12 * 60 + 30, IST); // Mon 12:30 IST
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return zonedInstant('2026-10-05', h * 60 + m, IST);
};

describe('plannedTimes (KIT-08)', () => {
  it('works back from the delivery time: dispatch = delivery − lead, kitchen = dispatch − 30', () => {
    const plan = plannedTimes(deliveryAt, 60, 30);
    expect(plan.plannedDispatchReadyAt).toEqual(at('11:30'));
    expect(plan.plannedKitchenReadyAt).toEqual(at('11:00'));
  });

  it('moves with the delivery time (KIT-09)', () => {
    const plan = plannedTimes(at('13:15'), 45, 30);
    expect(plan.plannedKitchenReadyAt).toEqual(at('12:00'));
  });
});

describe('unitRisk (KIT-10)', () => {
  const kitchenReady = at('11:00');
  it('is OK early, AT_RISK inside the window, LATE from the planned time', () => {
    expect(unitRisk(null, kitchenReady, at('10:29'), 30)).toBe('OK');
    expect(unitRisk(null, kitchenReady, at('10:30'), 30)).toBe('AT_RISK');
    expect(unitRisk(null, kitchenReady, at('11:00'), 30)).toBe('LATE');
  });

  it('is DONE once finished, whatever the time', () => {
    expect(unitRisk(at('11:20'), kitchenReady, at('12:00'), 30)).toBe('DONE');
  });
});

describe('dropRisk', () => {
  it('is late if not out for delivery by the planned dispatch-ready time', () => {
    expect(dropRisk('DISPATCH_READY', at('11:30'), at('11:31'), 30)).toBe('LATE');
    expect(dropRisk('PENDING', at('11:30'), at('11:10'), 30)).toBe('AT_RISK');
    expect(dropRisk('OUT_FOR_DELIVERY', at('11:30'), at('12:00'), 30)).toBe('DONE');
  });
});

describe('isOnTime (DSP-09)', () => {
  it('is on time at or before the delivery time plus grace', () => {
    expect(isOnTime(at('12:30'), deliveryAt, 0)).toBe(true);
    expect(isOnTime(at('12:31'), deliveryAt, 0)).toBe(false);
    expect(isOnTime(at('12:35'), deliveryAt, 5)).toBe(true);
  });
});
