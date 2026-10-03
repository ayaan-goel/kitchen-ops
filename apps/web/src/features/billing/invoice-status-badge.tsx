import type { InvoiceStatus } from '@fernleaf/shared';
import { formatCents } from '@/lib/format';
import { cn } from '@/lib/utils';

export function InvoiceStatusBadge({ status, className }: { status: InvoiceStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        status === 'PAID' ? 'bg-primary/15 text-primary' : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
        className,
      )}
    >
      {status === 'PAID' ? 'Paid' : 'Issued · unpaid'}
    </span>
  );
}

/** Money with credits visibly marked (green, minus sign), so a credit never reads as a charge. */
export function SignedCents({ cents, className }: { cents: number; className?: string }) {
  return <span className={cn('tabular-nums', cents < 0 && 'text-status-ok', className)}>{formatCents(cents)}</span>;
}
