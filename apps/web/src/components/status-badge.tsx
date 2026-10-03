import type { OrderStatus } from '@fernleaf/shared';
import { cn } from '@/lib/utils';

const STYLES: Record<OrderStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  PLACED: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  CONFIRMED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  DELIVERED: 'bg-primary/15 text-primary',
  CANCELLED: 'bg-zinc-200 text-zinc-700 line-through decoration-1 dark:bg-zinc-800 dark:text-zinc-300',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
};

const LABELS: Record<OrderStatus, string> = {
  DRAFT: 'Draft',
  PLACED: 'Placed',
  CONFIRMED: 'Confirmed',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
};

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', STYLES[status], className)}>
      {LABELS[status]}
    </span>
  );
}

export const ORDER_STATUS_LABELS = LABELS;
