'use client';

import { FileText } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Forbidden } from '@/components/forbidden';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useBillingCompanies } from '@/features/billing/api';
import { SignedCents } from '@/features/billing/invoice-status-badge';
import { hasPermission, useMe } from '@/lib/auth';
import { formatCents, formatDate } from '@/lib/format';

/** Billing overview (BIL-01, BIL-02): what each company owes and what is waiting to be invoiced. */
export default function BillingPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const { data, isPending, error } = useBillingCompanies();
  if (me && !hasPermission(me, 'billing.read')) return <Forbidden />;

  const sum = (pick: (c: NonNullable<typeof data>[number]) => number) => (data ?? []).reduce((s, c) => s + pick(c), 0);
  const figures = [
    { label: 'Not yet invoiced', value: formatCents(sum((c) => c.unbilledCents)), hint: `${sum((c) => c.unbilledOrders)} confirmed or delivered orders` },
    { label: 'Pending adjustments', value: formatCents(sum((c) => c.pendingAdjustmentCents)), hint: `${sum((c) => c.pendingAdjustments)} credits/debits for the next invoices` },
    { label: 'Invoiced, unpaid', value: formatCents(sum((c) => c.outstandingCents)), hint: `${sum((c) => c.outstandingInvoices)} open invoices` },
  ];

  return (
    <>
      <PageHeader
        title="Billing"
        description="Every confirmed order is owed in full by its company. Invoice them in batches; invoices never change afterwards."
        actions={
          <Button variant="outline" asChild>
            <Link href="/billing/invoices">
              <FileText className="size-4" /> All invoices
            </Link>
          </Button>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {figures.map((f) => (
          <div key={f.label} className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{f.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{data ? f.value : '…'}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{data ? f.hint : ''}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead className="text-right">Not yet invoiced</TableHead>
              <TableHead className="hidden md:table-cell">Oldest</TableHead>
              <TableHead className="text-right">Pending adjustments</TableHead>
              <TableHead className="text-right">Invoiced, unpaid</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {error && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-destructive">
                  {error.message}
                </TableCell>
              </TableRow>
            )}
            {data?.map((c) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`/billing/companies/${c.id}`)}>
                <TableCell className="font-medium">
                  <Link href={`/billing/companies/${c.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {c.unbilledOrders > 0 ? (
                    <>
                      {formatCents(c.unbilledCents)} <span className="text-xs text-muted-foreground">({c.unbilledOrders})</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{c.oldestUnbilled ? formatDate(c.oldestUnbilled) : '—'}</TableCell>
                <TableCell className="text-right">
                  {c.pendingAdjustments > 0 ? (
                    <>
                      <SignedCents cents={c.pendingAdjustmentCents} /> <span className="text-xs text-muted-foreground">({c.pendingAdjustments})</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {c.outstandingInvoices > 0 ? (
                    <>
                      {formatCents(c.outstandingCents)} <span className="text-xs text-muted-foreground">({c.outstandingInvoices})</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-sm text-primary">Review →</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
