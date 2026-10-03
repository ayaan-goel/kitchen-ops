'use client';

import type { CalendarDayDto } from '@fernleaf/shared';
import { Lock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { formatKitchen } from '@/lib/kitchen-time';
import { cn } from '@/lib/utils';

const REASONS: Record<string, string> = {
  KITCHEN_CLOSED: 'Kitchen closed',
  KITCHEN_HOLIDAY: 'Kitchen holiday',
  COMPANY_CLOSED: 'Company closed',
  COMPANY_HOLIDAY: 'Company holiday',
};

/** Delivery-date picker built from the server calendar (deliverable? cut-off? locked?). */
export function DateStrip({
  days,
  value,
  onChange,
  canOverride,
  zone,
}: {
  days: CalendarDayDto[] | undefined;
  value: string | null;
  onChange: (date: string) => void;
  canOverride: boolean;
  zone: string;
}) {
  if (!days) return <Skeleton className="h-20 w-full" />;
  return (
    <div className="flex gap-2 overflow-x-auto pb-2" role="radiogroup" aria-label="Delivery date">
      {days.map((d) => {
        const deliverable = d.status === 'OK';
        const selectable = deliverable && (!d.locked || canOverride);
        const selected = value === d.date;
        return (
          <button
            key={d.date}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={!selectable}
            onClick={() => onChange(d.date)}
            title={
              !deliverable
                ? REASONS[d.status]
                : d.locked
                  ? `Cut-off passed (${formatKitchen(d.cutoffAt, zone, { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} IST)${canOverride ? ' — admin override' : ''}`
                  : `Orders lock ${formatKitchen(d.cutoffAt, zone, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} IST`
            }
            className={cn(
              'flex min-w-24 shrink-0 flex-col items-start rounded-lg border px-3 py-2 text-left text-sm transition-colors',
              selected ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'hover:bg-accent',
              !selectable && 'cursor-not-allowed opacity-45 hover:bg-transparent',
            )}
          >
            <span className="font-medium">{formatDate(d.date, { weekday: 'short' })}</span>
            <span className="text-xs text-muted-foreground">{formatDate(d.date, { day: 'numeric', month: 'short' })}</span>
            <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              {!deliverable ? (
                REASONS[d.status]
              ) : d.locked ? (
                <>
                  <Lock className="size-3" aria-hidden /> {canOverride ? 'After cut-off' : 'Locked'}
                </>
              ) : (
                <>Until {formatKitchen(d.cutoffAt, zone, { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}</>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
