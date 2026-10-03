import type { Ratio } from '@fernleaf/shared';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** "84%" or "—" when there is nothing to divide by (PRD §8: never 0% or 100% for an empty denominator). */
export const pct = (r: Ratio) => (r.pct === null ? '—' : `${Math.round(r.pct)}%`);

export function StatTile({
  label,
  value,
  detail,
  href,
  tone,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  href?: string;
  tone?: 'late' | 'risk' | 'ok';
}) {
  const body = (
    <div className={cn('h-full rounded-xl border bg-card p-4', href && 'transition-colors hover:bg-accent/50')}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-3xl font-semibold tracking-tight',
          tone === 'late' && 'text-status-late',
          tone === 'ok' && 'text-status-ok',
        )}
      >
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Panel({ title, subtitle, action, children, className }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border bg-card p-4', className)} aria-label={title}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A meter: done ÷ total on a same-ramp track (never a two-slice pie). */
export function Meter({ ratio, label }: { ratio: Ratio; label: string }) {
  const w = ratio.den === 0 ? 0 : (ratio.num / ratio.den) * 100;
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-primary/15" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={ratio.den} aria-valuenow={ratio.num}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}
