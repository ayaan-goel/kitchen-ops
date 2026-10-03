'use client';

import { Input } from '@/components/ui/input';
import { parseDollarsToCents } from '@/lib/format';

export const centsToInput = (cents: number | null | undefined) => (cents === null || cents === undefined ? '' : (cents / 100).toFixed(2));

/** Dollar text box. The text is kept as typed; callers convert with `parseDollarsToCents` (exact, no floats). */
export function MoneyInput({ value, onChange, invalid, ...rest }: { value: string; onChange: (v: string) => void; invalid?: boolean } & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'>) {
  const bad = invalid ?? (value.trim() !== '' && parseDollarsToCents(value) === null);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">$</span>
      <Input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={bad || undefined} className="pl-6 tabular-nums" {...rest} />
    </div>
  );
}
