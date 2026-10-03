'use client';

import { ArrowLeft, CheckCircle2, Loader2, Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Forbidden } from '@/components/forbidden';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInvoice, useMarkPaid } from '@/features/billing/api';
import { InvoiceStatusBadge, SignedCents } from '@/features/billing/invoice-status-badge';
import { ApiError } from '@/lib/api-client';
import { hasPermission, useMe } from '@/lib/auth';
import { formatCents, formatDate, formatInvoiceNumber } from '@/lib/format';
import { formatKitchen, useMeta } from '@/lib/kitchen-time';

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const meta = useMeta().data;
  const zone = meta?.kitchenTimeZone ?? 'Asia/Kolkata';
  const { data: inv, isPending, error } = useInvoice(id);
  const [paying, setPaying] = useState(false);

  if (me && !hasPermission(me, 'billing.read')) return <Forbidden />;
  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (error || !inv) return <p className="text-sm text-destructive">{error?.message ?? 'Invoice not found'}</p>;

  const day = (iso: string) => formatKitchen(iso, zone, { day: 'numeric', month: 'short', year: 'numeric' });
  const orderLines = inv.lines.filter((l) => l.kind === 'ORDER');
  const adjustmentLines = inv.lines.filter((l) => l.kind === 'ADJUSTMENT');

  return (
    <>
      <div className="mb-2 flex items-center justify-between print:hidden">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href={`/billing/companies/${inv.company.id}`}>
            <ArrowLeft className="size-4" /> {inv.company.name}
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
          {inv.status === 'ISSUED' && hasPermission(me, 'billing.manage') && (
            <Button size="sm" onClick={() => setPaying(true)}>
              <CheckCircle2 className="size-4" /> Mark paid
            </Button>
          )}
        </div>
      </div>

      <article className="rounded-xl border bg-card p-6 print:border-0 print:p-0">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Fernleaf Kitchen · Invoice</p>
            <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
              {formatInvoiceNumber(inv.number)} <InvoiceStatusBadge status={inv.status} />
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Issued {day(inv.issuedAt)}
              {inv.issuedBy ? ` by ${inv.issuedBy}` : ''}
              {inv.periodStart && inv.periodEnd && ` · deliveries ${formatDate(inv.periodStart)} – ${formatDate(inv.periodEnd)}`}
            </p>
            {inv.status === 'PAID' && inv.paidAt && (
              <p className="mt-1 text-sm text-primary">
                Paid {day(inv.paidAt)}
                {inv.paymentReference ? ` · ref ${inv.paymentReference}` : ''}
                {inv.paidBy ? ` · recorded by ${inv.paidBy}` : ''}
              </p>
            )}
          </div>
          <div className="text-sm sm:text-right">
            <p className="font-medium">Bill to</p>
            <p>{inv.billTo.companyName}</p>
            <p>{inv.billTo.contactName}</p>
            <p className="text-muted-foreground">{inv.billTo.email}</p>
            {inv.billTo.phone && <p className="text-muted-foreground">{inv.billTo.phone}</p>}
            {inv.billTo.address && <p className="max-w-64 text-muted-foreground sm:ml-auto">{inv.billTo.address}</p>}
          </div>
        </header>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orderLines.map((l) => (
              <TableRow key={l.id}>
                <TableCell>
                  {l.orderId ? (
                    <Link href={`/orders/${l.orderId}`} className="hover:underline print:no-underline">
                      {l.description}
                    </Link>
                  ) : (
                    l.description
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">{l.deliveryDate ? formatDate(l.deliveryDate) : '—'}</TableCell>
                <TableCell className="text-right">
                  <SignedCents cents={l.amountCents} />
                </TableCell>
              </TableRow>
            ))}
            {adjustmentLines.length > 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="pt-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Adjustments to earlier orders
                </TableCell>
              </TableRow>
            )}
            {adjustmentLines.map((l) => (
              <TableRow key={l.id}>
                <TableCell>
                  {l.orderId ? (
                    <Link href={`/orders/${l.orderId}`} className="hover:underline print:no-underline">
                      {l.description}
                    </Link>
                  ) : (
                    l.description
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">{l.deliveryDate ? formatDate(l.deliveryDate) : '—'}</TableCell>
                <TableCell className="text-right">
                  <SignedCents cents={l.amountCents} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>
                Total ({inv.lines.length} lines{inv.totalCents < 0 ? ', credit note' : ''})
              </TableCell>
              <TableCell className="text-right text-base font-semibold">
                <SignedCents cents={inv.totalCents} />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>

        <p className="mt-3 text-xs text-muted-foreground">
          {inv.linesSumCents === inv.totalCents
            ? `Reconciled: the ${inv.lines.length} lines add up to ${formatCents(inv.totalCents)}.`
            : `Warning: lines add up to ${formatCents(inv.linesSumCents)}, not ${formatCents(inv.totalCents)}.`}{' '}
          Amounts were copied when the invoice was issued and never change.
        </p>
        {inv.notes && <p className="mt-3 text-sm">Notes: {inv.notes}</p>}
      </article>

      {paying && <MarkPaidDialog invoiceId={inv.id} today={meta?.today ?? ''} total={inv.totalCents} onClose={() => setPaying(false)} />}
    </>
  );
}

function MarkPaidDialog({ invoiceId, today, total, onClose }: { invoiceId: string; today: string; total: number; onClose: () => void }) {
  const [paidOn, setPaidOn] = useState(today);
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const markPaid = useMarkPaid(invoiceId);

  const submit = async () => {
    setError(null);
    try {
      await markPaid.mutateAsync({ paidOn: paidOn || undefined, reference: reference.trim() || undefined });
      toast.success('Invoice marked paid');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? (err.issues[0]?.message ?? err.message) : 'Could not save');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark paid</DialogTitle>
          <DialogDescription>Record that {formatCents(total)} has been received. This can’t be undone.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="paid-on">Payment date</Label>
            <Input id="paid-on" type="date" max={today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="paid-ref">Reference (optional)</Label>
            <Input id="paid-ref" value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} placeholder="e.g. NEFT UTR 1234" />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={markPaid.isPending}>
            {markPaid.isPending && <Loader2 className="size-4 animate-spin" />} Mark paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
