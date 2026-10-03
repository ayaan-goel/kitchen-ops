'use client';

import { ADJUSTMENT_REASON_LABELS, MANUAL_ADJUSTMENT_REASONS, type OrderDetailDto } from '@fernleaf/shared';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api-client';
import { formatCents, parseDollarsToCents } from '@/lib/format';
import { useAddAdjustment } from './api';

type Reason = (typeof MANUAL_ADJUSTMENT_REASONS)[number];

/**
 * Manual credit or debit on an order (A-32), e.g. a short delivery. Billed on the company's next
 * invoice; the server refuses credits larger than what remains billed for the order.
 */
export function AdjustmentDialog({ order, onClose }: { order: OrderDetailDto; onClose: () => void }) {
  const [kind, setKind] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState<Reason>('SHORT_DELIVERY');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = useAddAdjustment(order.id);
  const remaining = order.totalCents + order.adjustments.reduce((s, a) => s + a.amountCents, 0);
  const cents = parseDollarsToCents(amount);

  const submit = async () => {
    setError(null);
    if (!cents) {
      setError('Enter an amount like 7 or 7.50');
      return;
    }
    try {
      await add.mutateAsync({ amountCents: kind === 'credit' ? -cents : cents, reason, note });
      toast.success(`${kind === 'credit' ? 'Credit' : 'Debit'} of ${formatCents(cents)} added; it goes on the next invoice`);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? (err.issues[0]?.message ?? err.message) : 'Could not save');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add billing adjustment</DialogTitle>
          <DialogDescription>
            {order.invoice ? 'This order is already invoiced, so the invoice stays as it is.' : 'This order isn’t invoiced yet.'} The adjustment is billed as its own
            line on the company’s next invoice. Currently billed for this order: {formatCents(remaining)}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <RadioGroup value={kind} onValueChange={(v) => setKind(v as 'credit' | 'debit')} className="flex gap-6">
            <Label className="flex items-center gap-2 font-normal">
              <RadioGroupItem value="credit" /> Credit (company pays less)
            </Label>
            <Label className="flex items-center gap-2 font-normal">
              <RadioGroupItem value="debit" /> Debit (company pays more)
            </Label>
          </RadioGroup>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="adj-amount">Amount (USD)</Label>
              <Input id="adj-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="7.00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adj-reason">Reason</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as Reason)}>
                <SelectTrigger id="adj-reason" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_ADJUSTMENT_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ADJUSTMENT_REASON_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-note">Note</Label>
            <Textarea id="adj-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. One box missing on delivery" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={add.isPending || note.trim().length < 3 || !amount}>
            {add.isPending && <Loader2 className="size-4 animate-spin" />} Add {kind}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
