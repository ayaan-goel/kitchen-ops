import type { DropDto, DropStage } from '@fernleaf/shared';
import { CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export const STAGE_LABEL: Record<DropStage, string> = {
  PENDING: 'Pending',
  DISPATCH_READY: 'Dispatch-ready',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
};

const STAGE_STYLE: Record<DropStage, string> = {
  PENDING: 'bg-muted text-muted-foreground',
  DISPATCH_READY: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  OUT_FOR_DELIVERY: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  DELIVERED: 'bg-primary/15 text-primary',
};

export function DropStageBadge({ stage, className }: { stage: DropStage; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', STAGE_STYLE[stage], className)}>{STAGE_LABEL[stage]}</span>;
}

/** On-time is recorded once at delivery (A-29); shown with text, never colour alone. */
export function OnTimeBadge({ drop }: { drop: Pick<DropDto, 'deliveredOnTime'> }) {
  if (drop.deliveredOnTime === null) return null;
  return drop.deliveredOnTime ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-status-ok">
      <CheckCircle2 className="size-3.5" aria-hidden /> On time
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-status-late">
      <Clock className="size-3.5" aria-hidden /> Late
    </span>
  );
}

/** "3 of 4 orders kitchen-ready" with a bar. */
export function Readiness({ drop }: { drop: Pick<DropDto, 'readyOrders' | 'totalOrders'> }) {
  const pct = drop.totalOrders ? (drop.readyOrders / drop.totalOrders) * 100 : 0;
  const all = drop.readyOrders === drop.totalOrders;
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground tabular-nums">
        {drop.readyOrders} of {drop.totalOrders} {drop.totalOrders === 1 ? 'order' : 'orders'} kitchen-ready
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn('h-full rounded-full', all ? 'bg-status-ok' : 'bg-primary/60')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
