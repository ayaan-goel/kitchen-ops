'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Multi-select as toggle chips (allergens, dietary tags, sizes). Inactive items show only if selected. */
export function ChipPicker({
  items,
  value,
  onChange,
  disabled,
  label,
}: {
  items: { id: string; name: string; isActive?: boolean }[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  label: string;
}) {
  const visible = items.filter((i) => i.isActive !== false || value.includes(i.id));
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {visible.map((item) => {
        const on = value.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== item.id) : [...value, item.id])}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-60',
              on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
            )}
          >
            {on && <Check className="size-3" aria-hidden />}
            {item.name}
            {item.isActive === false && <span className="opacity-70">(inactive)</span>}
          </button>
        );
      })}
      {visible.length === 0 && <span className="text-xs text-muted-foreground">None defined yet.</span>}
    </div>
  );
}
