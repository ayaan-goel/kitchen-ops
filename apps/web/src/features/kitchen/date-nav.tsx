'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';

/** Adds days to a "YYYY-MM-DD" date without involving the browser's time zone. */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function DateNav({ date, today, onChange }: { date: string; today: string; onChange: (d: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => onChange(shiftDate(date, -1))}>
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-36 text-center text-sm font-medium">
        {formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}
        {date === today ? ' · today' : ''}
      </span>
      <Button variant="outline" size="icon" aria-label="Next day" onClick={() => onChange(shiftDate(date, 1))}>
        <ChevronRight className="size-4" />
      </Button>
      {date !== today && (
        <Button variant="ghost" size="sm" onClick={() => onChange(today)}>
          Today
        </Button>
      )}
    </div>
  );
}
