'use client';

import type { DropDto } from '@fernleaf/shared';
import { Clock, Info, Loader2, MapPin, Navigation, Package, PackageCheck, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Forbidden } from '@/components/forbidden';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePickedUp, useDriverDay } from '@/features/dispatch/api';
import { DeliverSheet } from '@/features/dispatch/deliver-sheet';
import { DropStageBadge, OnTimeBadge } from '@/features/dispatch/drop-bits';
import { hasPermission, useMe } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { formatKitchen, useMeta } from '@/lib/kitchen-time';
import { cn } from '@/lib/utils';

/** Phone-first driver view (DSP-06…08): only my drops for kitchen today, in time order. */
export default function DriverPage() {
  const { data: me } = useMe();
  const zone = useMeta().data?.kitchenTimeZone ?? 'Asia/Kolkata';
  const { data, isPending, isFetching, refetch, error } = useDriverDay();
  const [delivering, setDelivering] = useState<DropDto | null>(null);

  if (me && !hasPermission(me, 'deliveries.own')) return <Forbidden />;

  const drops = data?.drops ?? [];
  const open = drops.filter((d) => d.stage !== 'DELIVERED');
  const done = drops.filter((d) => d.stage === 'DELIVERED');
  const [next, ...later] = open;

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My deliveries</h1>
          <p className="text-sm text-muted-foreground">
            {data ? formatDate(data.date, { weekday: 'long', day: 'numeric', month: 'long' }) : '…'}
            {data && drops.length > 0 && (
              <>
                {' '}
                · {done.length} of {drops.length} delivered
              </>
            )}
          </p>
        </div>
        <Button variant="outline" size="icon" className="size-11" aria-label="Refresh" onClick={() => refetch()}>
          <RefreshCw className={cn('size-5', isFetching && 'animate-spin')} />
        </Button>
      </div>

      {isPending && <Skeleton className="h-64 w-full" />}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {data && drops.length === 0 && (
        <div className="rounded-xl border border-dashed px-4 py-16 text-center text-sm text-muted-foreground">No deliveries assigned to you today.</div>
      )}
      {data && drops.length > 0 && open.length === 0 && (
        <div className="mb-4 rounded-xl border bg-card px-4 py-6 text-center">
          <PackageCheck className="mx-auto mb-2 size-8 text-status-ok" aria-hidden />
          <p className="font-medium">All done for today</p>
        </div>
      )}

      {next && (
        <section aria-label="Next drop" className="mb-6">
          <h2 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Next</h2>
          <DriverDropCard drop={next} zone={zone} highlight onDeliver={() => setDelivering(next)} />
        </section>
      )}

      {later.length > 0 && (
        <section aria-label="Later today" className="mb-6">
          <h2 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Later today ({later.length})</h2>
          <div className="space-y-3">
            {later.map((d) => (
              <DriverDropCard key={d.id} drop={d} zone={zone} onDeliver={() => setDelivering(d)} />
            ))}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section aria-label="Delivered">
          <h2 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Delivered ({done.length})</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {done.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium tabular-nums">{d.deliveryTime}</span> · <span className="truncate">{d.company.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {d.deliveredAt ? `Delivered ${formatKitchen(d.deliveredAt, zone)}` : ''} · {d.boxes} boxes
                  </span>
                </span>
                <OnTimeBadge drop={d} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {delivering && <DeliverSheet drop={delivering} onClose={() => setDelivering(null)} />}
    </div>
  );
}

function DriverDropCard({ drop, zone, highlight, onDeliver }: { drop: DropDto; zone: string; highlight?: boolean; onDeliver: () => void }) {
  const pickedUp = usePickedUp();
  const notes = [drop.address.notes, drop.instructions].filter(Boolean);
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(drop.address.text)}`;

  return (
    <article className={cn('rounded-xl border bg-card p-4 shadow-sm', highlight && 'border-primary ring-1 ring-primary')}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-2xl leading-none font-semibold tabular-nums">{drop.deliveryTime}</p>
          <p className="mt-1 font-medium">{drop.company.name}</p>
        </div>
        <DropStageBadge stage={drop.stage} />
      </div>

      <a href={mapUrl} target="_blank" rel="noreferrer" className="mb-2 flex items-start gap-2 text-sm hover:underline">
        <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>
          {drop.address.text}
          <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-primary">
            <Navigation className="size-3" aria-hidden /> Map
          </span>
        </span>
      </a>
      <p className="mb-2 flex items-center gap-2 text-sm">
        <Package className="size-4 text-muted-foreground" aria-hidden />
        <span className="font-semibold tabular-nums">{drop.boxes}</span> {drop.boxes === 1 ? 'box' : 'boxes'} · {drop.totalOrders}{' '}
        {drop.totalOrders === 1 ? 'order' : 'orders'}
      </p>
      {notes.length > 0 && (
        <p className="mb-2 flex items-start gap-2 rounded-lg bg-muted px-2.5 py-2 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> {notes.join(' · ')}
        </p>
      )}
      <details className="mb-3 text-sm">
        <summary className="cursor-pointer text-muted-foreground">Who it’s for</summary>
        <ul className="mt-1 space-y-0.5 pl-1">
          {drop.orders.map((o) => (
            <li key={o.id}>
              {o.employeeName} · {o.boxes} {o.boxes === 1 ? 'box' : 'boxes'}
            </li>
          ))}
        </ul>
      </details>

      {drop.stage === 'PENDING' && (
        <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
          <Clock className="size-4" aria-hidden /> Being prepared. Ready to collect around {formatKitchen(drop.plannedDispatchReadyAt, zone)}.
        </p>
      )}
      {drop.stage === 'DISPATCH_READY' && (
        <Button className="h-12 w-full text-base" disabled={pickedUp.isPending} onClick={() => pickedUp.mutate(drop.id)}>
          {pickedUp.isPending ? <Loader2 className="size-5 animate-spin" /> : <Package className="size-5" />} Picked up
        </Button>
      )}
      {drop.stage === 'OUT_FOR_DELIVERY' && (
        <Button className="h-12 w-full text-base" onClick={onDeliver}>
          <PackageCheck className="size-5" /> Mark delivered
        </Button>
      )}
    </article>
  );
}
