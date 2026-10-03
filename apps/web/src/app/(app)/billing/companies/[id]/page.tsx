'use client';

import { ADJUSTMENT_REASON_LABELS } from '@fernleaf/shared';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Forbidden } from '@/components/forbidden';
import { PageHeader } from '@/components/page-header';
import { OrderStatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useCompanyBillable, useCreateInvoice, useInvoices } from '@/features/billing/api';
import { InvoiceStatusBadge, SignedCents } from '@/features/billing/invoice-status-badge';
import { ApiError } from '@/lib/api-client';
import { hasPermission, useMe } from '@/lib/auth';
import { formatCents, formatDate, formatInvoiceNumber, formatOrderNumber } from '@/lib/format';

/** One company's unbilled orders and pending adjustments → a new invoice (BIL-02, BIL-03). */
export default function CompanyBillingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: me } = useMe();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // Everything listed is selected unless unticked, so changing the date range needs no syncing.
  const [excludedOrders, setExcludedOrders] = useState<Set<string>>(new Set());
  const [excludedAdjustments, setExcludedAdjustments] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [notes, setNotes] = useState('');
  const { data, isPending, error, isFetching } = useCompanyBillable(id, from, to);
  const invoices = useInvoices({ companyId: id, pageSize: 5 });
  const create = useCreateInvoice();
  const canManage = hasPermission(me, 'billing.manage');

  if (me && !hasPermission(me, 'billing.read')) return <Forbidden />;

  const orders = data?.orders ?? [];
  const adjustments = data?.adjustments ?? [];
  const chosenOrders = orders.filter((o) => !excludedOrders.has(o.id));
  const chosenAdjustments = adjustments.filter((a) => !excludedAdjustments.has(a.id));
  const total = chosenOrders.reduce((s, o) => s + o.totalCents, 0) + chosenAdjustments.reduce((s, a) => s + a.amountCents, 0);
  const nothing = chosenOrders.length + chosenAdjustments.length === 0;

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, key: string, include: boolean) => {
    const next = new Set(set);
    if (include) next.delete(key);
    else next.add(key);
    setter(next);
  };

  const submit = async () => {
    try {
      const inv = await create.mutateAsync({
        companyId: id,
        orderIds: chosenOrders.map((o) => o.id),
        adjustmentIds: chosenAdjustments.map((a) => a.id),
        notes,
      });
      toast.success(`${formatInvoiceNumber(inv.number)} issued for ${formatCents(inv.totalCents)}`);
      router.push(`/billing/invoices/${inv.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create the invoice');
      setConfirming(false);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link href="/billing">
          <ArrowLeft className="size-4" /> Billing
        </Link>
      </Button>
      <PageHeader
        title={data?.company.name ?? 'Company billing'}
        description={data ? `Bill to ${data.company.billingContactName} · ${data.company.billingEmail}` : undefined}
      />
      {error && <p className="mb-4 text-sm text-destructive">{error.message}</p>}

      <section className="mb-6">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-semibold">Not yet invoiced</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Label htmlFor="from" className="text-muted-foreground">
              Delivered from
            </Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
            <Label htmlFor="to" className="text-muted-foreground">
              to
            </Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
            {(from || to) && (
              <Button variant="ghost" size="sm" onClick={() => {
                  setFrom('');
                  setTo('');
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Select all orders"
                    disabled={!canManage || orders.length === 0}
                    checked={orders.length > 0 && chosenOrders.length === orders.length ? true : chosenOrders.length > 0 ? 'indeterminate' : false}
                    onCheckedChange={(v) => setExcludedOrders(v === true ? new Set() : new Set(orders.map((o) => o.id)))}
                  />
                </TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead className="hidden md:table-cell">Employee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-16 w-full" />
                  </TableCell>
                </TableRow>
              )}
              {data && orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    {from || to ? 'Nothing unbilled in this date range.' : 'Everything is invoiced.'}
                  </TableCell>
                </TableRow>
              )}
              {orders.map((o) => (
                <TableRow key={o.id} data-state={excludedOrders.has(o.id) ? undefined : 'selected'}>
                  <TableCell>
                    <Checkbox
                      aria-label={`Include ${formatOrderNumber(o.number)}`}
                      disabled={!canManage}
                      checked={!excludedOrders.has(o.id)}
                      onCheckedChange={(v) => toggle(excludedOrders, setExcludedOrders, o.id, v === true)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/orders/${o.id}`} className="hover:underline">
                      {formatOrderNumber(o.number)}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(o.deliveryDate)}</TableCell>
                  <TableCell className="hidden md:table-cell">{o.employeeName}</TableCell>
                  <TableCell>
                    <OrderStatusBadge status={o.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(o.totalCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {adjustments.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold">Pending adjustments</h2>
          <p className="mb-2 text-sm text-muted-foreground">Credits and debits on orders, waiting for an invoice. They appear as separate lines.</p>
          <div className="rounded-xl border bg-card">
            <Table>
              <TableBody>
                {adjustments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="w-10">
                      <Checkbox
                        aria-label={`Include adjustment on ${formatOrderNumber(a.orderNumber)}`}
                        disabled={!canManage}
                        checked={!excludedAdjustments.has(a.id)}
                        onCheckedChange={(v) => toggle(excludedAdjustments, setExcludedAdjustments, a.id, v === true)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/orders/${a.orderId}`} className="hover:underline">
                        {formatOrderNumber(a.orderNumber)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {ADJUSTMENT_REASON_LABELS[a.reason]}
                      {a.note && <span className="block text-xs text-muted-foreground">{a.note}</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <SignedCents cents={a.amountCents} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {canManage && data && (
        <div className="sticky bottom-0 z-10 -mx-4 mb-6 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
          <p className="text-sm">
            <span className="font-medium tabular-nums">{chosenOrders.length}</span> orders
            {adjustments.length > 0 && (
              <>
                {' '}
                + <span className="font-medium tabular-nums">{chosenAdjustments.length}</span> adjustments
              </>
            )}{' '}
            · total <span className="font-semibold tabular-nums">{formatCents(total)}</span>
            {isFetching && <span className="ml-2 text-muted-foreground">updating…</span>}
          </p>
          <Button disabled={nothing || isFetching} onClick={() => setConfirming(true)}>
            <FileText className="size-4" /> Create invoice
          </Button>
        </div>
      )}

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-semibold">Recent invoices</h2>
          <Link href={`/billing/invoices?companyId=${id}`} className="text-sm text-primary hover:underline">
            See all
          </Link>
        </div>
        {invoices.data?.items.length === 0 && <p className="text-sm text-muted-foreground">No invoices yet.</p>}
        <ul className="divide-y rounded-xl border bg-card">
          {invoices.data?.items.map((inv) => (
            <li key={inv.id}>
              <Link href={`/billing/invoices/${inv.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-accent">
                <span className="font-medium">{formatInvoiceNumber(inv.number)}</span>
                <span className="text-muted-foreground">
                  {inv.periodStart && inv.periodEnd ? `${formatDate(inv.periodStart)} – ${formatDate(inv.periodEnd)}` : ''} · {inv.lineCount} lines
                </span>
                <SignedCents cents={inv.totalCents} className="font-medium" />
                <InvoiceStatusBadge status={inv.status} />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Dialog open={confirming} onOpenChange={(o) => !create.isPending && setConfirming(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue invoice for {formatCents(total)}?</DialogTitle>
            <DialogDescription>
              {chosenOrders.length} orders and {chosenAdjustments.length} adjustments for {data?.company.name}. Amounts are copied onto the invoice and it can’t
              be edited afterwards; later changes become adjustments on the next invoice.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="invoice-notes">Notes on the invoice (optional)</Label>
            <Textarea id="invoice-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. PO 4471" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={create.isPending}>
              {create.isPending && <Loader2 className="size-4 animate-spin" />} Issue invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
