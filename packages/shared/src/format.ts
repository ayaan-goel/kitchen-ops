/** Display helpers. Money is always integer cents; formatting happens only at the edges. */

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatCents(cents: number): string {
  // cents / 100 is exact enough for display of integer cents (no arithmetic follows).
  return usd.format(cents / 100);
}

export function formatOrderNumber(n: number): string {
  return `FL-${String(n).padStart(6, '0')}`;
}

export function formatInvoiceNumber(n: number): string {
  return `INV-${String(n).padStart(4, '0')}`;
}

/** Minutes after midnight -> "HH:mm". */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "HH:mm" -> minutes after midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number) as [number, number];
  return h * 60 + m;
}
