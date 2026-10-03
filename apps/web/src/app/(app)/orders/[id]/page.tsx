'use client';

import type { OrderDetailDto } from '@fernleaf/shared';
import { ArrowLeft, Ban, Clock, Loader2, MapPin, Package, Pencil, Send, Truck, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Forbidden } from '@/components/forbidden';
import { OrderStatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOrder, useOrderAction } from '@/features/orders/api';
import { DeliveryOverrideDialog, ReasonDialog } from '@/features/orders/order-actions';
import { ApiError } from '@/lib/api-client';
import { hasPermission, useMe } from '@/lib/auth';
import { formatCents, formatDate, formatInvoiceNumber, formatOrderNumber } from '@/lib/format';
import { formatKitchen, useMeta } from '@/lib/kitchen-time';

const EVENT_LABELS: Record<string, string> = {
  CREATED: 'Created',
  UPDATED: 'Edited',
  PLACED: 'Placed',
  CONFIRMED: 'Confirmed (cut-off)',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
  KITCHEN_STARTED: 'Kitchen started',
  KITCHEN_READY: 'Kitchen ready',
  KITCHEN_FORCE_COMPLETED: 'Kitchen force-completed',
  DELIVERY_CHANGED: 'Delivery details changed',
  DROP_ASSIGNED: 'Added to delivery drop',
  DRIVER_ASSIGNED: 'Driver assigned',
  DISPATCH_READY: 'Dispatch ready',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  INVOICED: 'Invoiced',
  ADJUSTMENT_ADDED: 'Billing adjustment added',
};

function eventDetail(type: string, data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.reason === 'string') return d.reason;
  if (type === 'CONFIRMED' && d.afterCutoff) return 'Placed by an admin after the cut-off';
  if (type === 'DELIVERY_CHANGED' && d.before && d.after) {
    const b = d.before as Record<string, string>;
    const a = d.after as Record<string, string>;
    const parts = [];
    if (b.deliveryTime !== a.deliveryTime) parts.push(`time ${b.deliveryTime} → ${a.deliveryTime}`);
    if (b.address !== a.address) parts.push('address changed');
    if (b.packagingTypeId !== a.packagingTypeId) parts.push('packaging changed');
    return parts.join(', ') || null;
  }
  if (typeof d.amountCents === 'number') return formatCents(d.amountCents);
  return null;
}

function Actions({ order }: { order: OrderDetailDto }) {
  const { data: me } = useMe();
  const [dialog, setDialog] = useState<'cancel' | 'reject' | 'delivery' | null>(null);
  const action = useOrderAction(order.id);
  const canWrite = hasPermission(me, 'orders.write');
  const canOverride = hasPermission(me, 'orders.override');
  const open = order.status === 'DRAFT' || order.status === 'PLACED';
  const editable = (open && (!order.locked || canOverride) && canWrite) || (order.status === 'CONFIRMED' && canOverride);

  const place = async () => {
    try {
      await action.mutateAsync({ kind: 'place', version: order.version });
      toast.success('Order placed');
    } catch (err) {
      toast.error(err instanceof ApiError ? (err.issues[0]?.message ?? err.message) : 'Could not place the order');
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {editable && (
        <Button variant="outline" asChild>
          <Link href={`/orders/${order.id}/edit`}>
            <Pencil className="size-4" /> Edit
          </Link>
        </Button>
      )}
      {order.status === 'DRAFT' && canWrite && (
        <Button onClick={place} disabled={action.isPending}>
          {action.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Place
        </Button>
      )}
      {order.status === 'CONFIRMED' && canOverride && (
        <Button variant="outline" onClick={() => setDialog('delivery')}>
          <Truck className="size-4" /> Change delivery
        </Button>
      )}
      {((open && canWrite && (!order.locked || canOverride)) || (order.status === 'CONFIRMED' && canOverride)) && (
        <Button variant="outline" onClick={() => setDialog('cancel')}>
          <XCircle className="size-4" /> Cancel
        </Button>
      )}
      {(order.status === 'PLACED' || order.status === 'CONFIRMED') && canOverride && (
        <Button variant="outline" className="text-destructive" onClick={() => setDialog('reject')}>
          <Ban className="size-4" /> Reject
        </Button>
      )}
      <ReasonDialog order={order} kind="cancel" open={dialog === 'cancel'} onOpenChange={(o) => setDialog(o ? 'cancel' : null)} />
      <ReasonDialog order={order} kind="reject" open={dialog === 'reject'} onOpenChange={(o) => setDialog(o ? 'reject' : null)} />
      {dialog === 'delivery' && <DeliveryOverrideDialog order={order} open onOpenChange={(o) => setDialog(o ? 'delivery' : null)} />}
    </div>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const zone = useMeta().data?.kitchenTimeZone ?? 'Asia/Kolkata';
  const { data: order, isPending, error } = useOrder(id);

  if (me && !hasPermission(me, 'orders.read')) return <Forbidden />;
  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (error || !order) return <p className="text-sm text-destructive">{error?.message ?? 'Order not found'}</p>;

  const t = (iso: string | null) => (iso ? formatKitchen(iso, zone, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '—');

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link href="/orders">
          <ArrowLeft className="size-4" /> Orders
        </Link>
      </Button>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
            {formatOrderNumber(order.number)} <OrderStatusBadge status={order.status} />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {order.employee.name} · {order.company.name} · priced on {order.tierName}
          </p>
          {order.statusReason && <p className="mt-1 text-sm">Reason: {order.statusReason}</p>}
        </div>
        <Actions order={order} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Lines and money</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Item</TableHead>
                    <TableHead className="text-right">Unit</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="pr-6 text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.lines.map((l) =>
                    l.combinations.map((c, j) => (
                      <TableRow key={c.id}>
                        <TableCell className="pl-6 align-top">
                          {j === 0 && (
                            <p className="font-medium">
                              {l.dishName} <span className="text-xs font-normal text-muted-foreground">{l.dishSku} · base {formatCents(l.dishUnitPriceCents)}</span>
                            </p>
                          )}
                          <p className="text-sm">{c.label || 'As served'}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.selections
                              .filter((s) => s.optionUnitPriceCents + s.portionExtraCents > 0)
                              .map((s) => `${s.optionName}${s.portionName ? ` (${s.portionName})` : ''} +${formatCents(s.optionUnitPriceCents + s.portionExtraCents)}`)
                              .join(' · ')}
                          </p>
                          {(c.kitchenStartedAt || c.kitchenDoneAt) && (
                            <p className="text-xs text-muted-foreground">
                              Kitchen: {c.kitchenDoneAt ? `done ${t(c.kitchenDoneAt)}` : `started ${t(c.kitchenStartedAt)}`}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right align-top tabular-nums">{formatCents(c.unitPriceCents)}</TableCell>
                        <TableCell className="text-right align-top tabular-nums">{c.quantity}</TableCell>
                        <TableCell className="pr-6 text-right align-top tabular-nums">{formatCents(c.totalCents)}</TableCell>
                      </TableRow>
                    )),
                  )}
                  {order.lines.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                        No dishes yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="pl-6 font-semibold">
                      Order total (pre-tax, billed to {order.company.name})
                    </TableCell>
                    <TableCell className="pr-6 text-right font-semibold tabular-nums">{formatCents(order.totalCents)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l pl-5">
                {order.events.map((e) => (
                  <li key={e.id}>
                    <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-background bg-primary" aria-hidden />
                    <p className="text-sm font-medium">{EVENT_LABELS[e.type] ?? e.type}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(e.at)} IST · {e.actor ?? 'System'}
                      {eventDetail(e.type, e.data) ? ` · ${eventDetail(e.type, e.data)}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Delivery</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="flex gap-2">
                <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                {formatDate(order.deliveryDate, { weekday: 'long', day: 'numeric', month: 'long' })} at {order.deliveryTime} IST
              </p>
              <p className="flex gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                {order.address.text}
              </p>
              <p className="flex gap-2">
                <Package className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                {order.packagingType.name}
              </p>
              {order.notes && <p className="rounded-md bg-muted p-2">“{order.notes}”</p>}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t pt-3 text-xs">
                <dt className="text-muted-foreground">Cut-off</dt>
                <dd>
                  {t(order.cutoffAt)} {order.locked ? '(passed)' : ''}
                </dd>
                <dt className="text-muted-foreground">Kitchen ready by</dt>
                <dd>{t(order.plannedKitchenReadyAt)}</dd>
                <dt className="text-muted-foreground">Leaves kitchen by</dt>
                <dd>{t(order.plannedDispatchReadyAt)}</dd>
                <dt className="text-muted-foreground">Kitchen started</dt>
                <dd>{t(order.kitchenStartedAt)}</dd>
                <dt className="text-muted-foreground">Kitchen ready</dt>
                <dd>
                  {t(order.kitchenReadyAt)}
                  {order.kitchenForced ? ' (forced)' : ''}
                </dd>
                <dt className="text-muted-foreground">Drop</dt>
                <dd>{order.drop ? `${order.drop.stage.replaceAll('_', ' ').toLowerCase()} · ${order.drop.driverName ?? 'no driver'}` : '—'}</dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Billing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                {order.invoice
                  ? `On ${formatInvoiceNumber(order.invoice.number)} (${order.invoice.status.toLowerCase()})`
                  : order.status === 'CONFIRMED' || order.status === 'DELIVERED'
                    ? 'Billable, not invoiced yet'
                    : 'Not billable'}
              </p>
              {order.adjustments.map((a) => (
                <p key={a.id} className="flex justify-between text-xs">
                  <span>
                    {a.reason.replaceAll('_', ' ').toLowerCase()} {a.invoiced ? '(invoiced)' : '(pending)'}
                  </span>
                  <span className="tabular-nums">{formatCents(a.amountCents)}</span>
                </p>
              ))}
              <p className="text-xs text-muted-foreground">
                Created {t(order.createdAt)} by {order.createdBy ?? 'System (demo data)'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
