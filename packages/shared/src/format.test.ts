import { describe, expect, it } from 'vitest';
import { formatCents, formatOrderNumber, minutesToTime, timeToMinutes } from './format';

describe('format', () => {
  it('formats integer cents as USD', () => {
    expect(formatCents(215)).toBe('$2.15');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(-500)).toBe('-$5.00');
  });

  it('formats order numbers', () => {
    expect(formatOrderNumber(123)).toBe('FL-000123');
  });

  it('round-trips times of day', () => {
    expect(minutesToTime(750)).toBe('12:30');
    expect(timeToMinutes('16:00')).toBe(960);
    expect(minutesToTime(timeToMinutes('07:05'))).toBe('07:05');
  });
});
