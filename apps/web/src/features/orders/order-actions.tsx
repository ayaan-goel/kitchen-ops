'use client';

import type { OrderDetailDto } from '@fernleaf/shared';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api-client';
import { useDeliveryOverride, useOrderAction, useOrderingContext } from './api';

export function ReasonDialog({
  order,
  kind,
  open,
  onOpenChange,
}: {
  order: OrderDetailDto;
  kind: 'cancel' | 'reject';
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const action = useOrderAction(order.id);
  const invoiced = order.invoice !== null;

  const submit = async () => {
    setError(null);
    try {
      await action.mutateAsync({ kind, reason });
      toast.success(kind === 'cancel' ? 'Order cancelled' : 'Order rejected');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? (err.issues[0]?.message ?? err.message) : 'Something went wrong');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{kind === 'cancel' ? 'Cancel this order?' : 'Reject this order?'}</DialogTitle>
          <DialogDescription>
            {kind === 'reject' ? 'Use reject when the kitchen cannot fulfil the order. ' : ''}
            {invoiced
              ? 'This order is already invoiced. The invoice will not change; a credit for the billed amount is added to the company’s next invoice.'
              : 'It will no longer be cooked, delivered or billed.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="reason">Reason</Label>
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Employee on leave" />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep order
          </Button>
          <Button variant="destructive" disabled={reason.trim().length < 3 || action.isPending} onClick={submit}>
            {action.isPending && <Loader2 className="size-4 animate-spin" />}
            {kind === 'cancel' ? 'Cancel order' : 'Reject order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Admin override of time / address / packaging after confirmation (ORD-08). */
export function DeliveryOverrideDialog({
  order,
  open,
  onOpenChange,
}: {
  order: OrderDetailDto;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const ctx = useOrderingContext(open ? order.employee.id : null);
  const [time, setTime] = useState(order.deliveryTime);
  const [addressId, setAddressId] = useState(order.address.id);
  const [packagingTypeId, setPackagingTypeId] = useState(order.packagingType.id);
  const [error, setError] = useState<string | null>(null);
  const override = useDeliveryOverride(order.id);

  const times: string[] = [];
  if (ctx.data) {
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    for (let m = toMin(ctx.data.deliveryWindow.start); m <= toMin(ctx.data.deliveryWindow.end); m += ctx.data.deliveryWindow.stepMinutes) {
      times.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    }
  }

  const submit = async () => {
    setError(null);
    try {
      await override.mutateAsync({ version: order.version, deliveryTime: time, addressId, packagingTypeId });
      toast.success('Delivery details updated');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? (err.issues[0]?.message ?? err.message) : 'Something went wrong');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change delivery details</DialogTitle>
          <DialogDescription>
            Admin override after confirmation. Planned kitchen and dispatch times are recalculated and the order moves to the matching delivery drop.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Time (IST)</Label>
            <Select value={time} onValueChange={setTime}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {(times.length ? times : [order.deliveryTime]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Select value={addressId} onValueChange={setAddressId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(ctx.data?.addresses ?? [{ id: order.address.id, label: order.address.label }]).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Packaging</Label>
            <Select value={packagingTypeId} onValueChange={setPackagingTypeId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(ctx.data?.packagingTypes ?? [order.packagingType]).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button disabled={override.isPending} onClick={submit}>
            {override.isPending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
