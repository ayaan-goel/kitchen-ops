export { formatCents, formatInvoiceNumber, formatOrderNumber } from '@fernleaf/shared';

/**
 * Calendar dates ("YYYY-MM-DD") are kitchen-local dates without a time, so they are formatted in
 * UTC to avoid any shift by the browser's time zone.
 */
export function formatDate(date: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', ...options }).format(new Date(`${date}T00:00:00Z`));
}

/** Dollars typed by staff → integer cents, without floating-point maths. Returns null if invalid. */
export function parseDollarsToCents(input: string): number | null {
  const m = /^\s*\$?\s*(\d{1,6})(?:\.(\d{1,2}))?\s*$/.exec(input);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
}
