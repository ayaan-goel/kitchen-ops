'use client';

import type { AssignableDriverDto, DropDto } from '@fernleaf/shared';
import { Camera, ChevronDown, MapPin, Package, PackageCheck, Send, Truck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { RiskBadge } from '@/features/kitchen/unit-card';
import { formatOrderNumber } from '@/lib/format';
import { formatKitchen } from '@/lib/kitchen-time';
import { cn } from '@/lib/utils';
import type { DropStep } from './api';
import { OnTimeBadge, Readiness } from './drop-bits';

const NONE = '__none';

const RISK_BAR: Record<DropDto['risk'], string> = {
  LATE: 'bg-status-late',
  AT_RISK: 'bg-status-risk',
  OK: 'bg-border',
  DONE: 'bg-status-ok',
};

export function DropCard({
  drop,
  drivers,
  zone,
  canManage,
  busy,
  onStep,
  onAssign,
}: {
  drop: DropDto;
  drivers: AssignableDriverDto[];
  zone: string;
  canManage: boolean;
  busy: boolean;
  onStep: (step: DropStep, note?: string) => void;
  onAssign: (driver: AssignableDriverDto | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const t = (iso: string) => formatKitchen(iso, zone);
  const departed = drop.stage === 'OUT_FOR_DELIVERY' || drop.stage === 'DELIVERED';
  const allReady = drop.readyOrders === drop.totalOrders;
  // The current driver may no longer be assignable (deactivated); keep them visible in the list.
  const options = drop.driver && !drivers.some((d) => d.id === drop.driver!.id) ? [{ ...drop.driver, dropsOnDate: 0, openDrops: 0 }, ...drivers] : drivers;

  return (
    <article className="relative flex overflow-hidden rounded-lg border bg-card" aria-label={`${drop.company.name} at ${drop.deliveryTime}`}>
      <div className={cn('w-1.5 shrink-0', RISK_BAR[drop.risk])} aria-hidden />
      <div className="min-w-0 flex-1 space-y-2.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 font-medium">
              <span className="tabular-nums">{drop.deliveryTime}</span> · <span className="truncate">{drop.company.name}</span>
              <RiskBadge risk={drop.risk} />
            </p>
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" aria-hidden /> {drop.address.label}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums" title="Boxes">
            <Package className="size-4 text-muted-foreground" aria-hidden /> {drop.boxes}
          </span>
        </div>

        {drop.stage === 'PENDING' && <Readiness drop={drop} />}
        {drop.stage !== 'DELIVERED' && (
          <p className="text-xs text-muted-foreground">
            Leave kitchen by <span className="font-medium text-foreground tabular-nums">{t(drop.plannedDispatchReadyAt)}</span>
            {drop.outForDeliveryAt && <> · left {t(drop.outForDeliveryAt)}</>}
          </p>
        )}
        {drop.stage === 'DELIVERED' && (
          <div className="space-y-1 text-xs">
            <p className="flex flex-wrap items-center gap-2">
              Delivered {drop.deliveredAt ? t(drop.deliveredAt) : ''}
              {drop.deliveredBy ? ` by ${drop.deliveredBy}` : ''} <OnTimeBadge drop={drop} />
            </p>
            {drop.deliveryNote && <p className="text-muted-foreground">“{drop.deliveryNote}”</p>}
            {drop.photoId && (
              <a href={`/api/files/${drop.photoId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                <Camera className="size-3.5" aria-hidden /> Delivery photo
              </a>
            )}
          </div>
        )}

        {canManage && !departed ? (
          <Select value={drop.driver?.id ?? NONE} onValueChange={(v) => onAssign(v === NONE ? null : (options.find((d) => d.id === v) ?? null))}>
            <SelectTrigger size="sm" className="w-full" aria-label="Driver">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No driver</SelectItem>
              {options.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name} <span className="text-muted-foreground">· {d.openDrops} open</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="flex items-center gap-1.5 text-xs">
            <Truck className="size-3.5 text-muted-foreground" aria-hidden />
            {drop.driver ? drop.driver.name : <span className="text-muted-foreground">No driver</span>}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {canManage && drop.stage === 'PENDING' && (
            <Button
              size="sm"
              disabled={busy || !allReady}
              title={allReady ? undefined : 'Waiting for the kitchen'}
              onClick={() => onStep('dispatch-ready')}
            >
              <PackageCheck className="size-4" /> Dispatch-ready
            </Button>
          )}
          {canManage && drop.stage === 'DISPATCH_READY' && (
            <Button size="sm" disabled={busy || !drop.driver} title={drop.driver ? undefined : 'Assign a driver first'} onClick={() => onStep('out-for-delivery')}>
              <Send className="size-4" /> Out for delivery
            </Button>
          )}
          {canManage && drop.stage === 'OUT_FOR_DELIVERY' && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setDeliverOpen(true)}>
              <PackageCheck className="size-4" /> Record delivery
            </Button>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {drop.totalOrders} {drop.totalOrders === 1 ? 'order' : 'orders'}
            <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
        </div>

        {open && (
          <ul className="space-y-1 border-t pt-2 text-xs">
            {drop.orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
                    {formatOrderNumber(o.number)}
                  </Link>{' '}
                  · {o.employeeName} · {o.boxes} {o.boxes === 1 ? 'box' : 'boxes'}
                </span>
                <span className={cn('shrink-0', o.kitchenReadyAt ? 'text-status-ok' : 'text-muted-foreground')}>
                  {o.kitchenReadyAt ? `ready ${t(o.kitchenReadyAt)}${o.kitchenForced ? ' (forced)' : ''}` : `due ${t(o.plannedKitchenReadyAt)}`}
                </span>
              </li>
            ))}
            {(drop.address.notes || drop.instructions) && (
              <li className="pt-1 text-muted-foreground">Driver notes: {[drop.address.notes, drop.instructions].filter(Boolean).join(' · ')}</li>
            )}
          </ul>
        )}
      </div>
      {deliverOpen && <RecordDeliveryDialog drop={drop} onClose={() => setDeliverOpen(false)} onConfirm={(note) => onStep('delivered', note)} />}
    </article>
  );
}

/** Dispatch records a delivery on the driver's behalf (A-28); the driver's own flow adds a photo. */
function RecordDeliveryDialog({ drop, onClose, onConfirm }: { drop: DropDto; onClose: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record delivery</DialogTitle>
          <DialogDescription>
            {drop.company.name}, {drop.address.label} at {drop.deliveryTime}. On-time is worked out from the current time and is recorded once.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="delivery-note">Note (optional)</Label>
          <Textarea id="delivery-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="e.g. Driver called it in; left at reception" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm(note);
              onClose();
            }}
          >
            Mark delivered
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
