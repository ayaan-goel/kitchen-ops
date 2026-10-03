'use client';

import type { DropDto } from '@fernleaf/shared';
import { Camera, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api-client';
import { compressPhoto, useDriverDeliver } from './api';

/** Driver's "Mark delivered": optional note and photo (camera on phones), compressed on the device (DSP-07). */
export function DeliverSheet({ drop, onClose }: { drop: DropDto; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const deliver = useDriverDeliver();

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setPreparing(true);
    const blob = await compressPhoto(file);
    setPreparing(false);
    if (blob.size > 5 * 1024 * 1024) {
      setError('That photo is too large even after shrinking. Try another one.');
      return;
    }
    setPhoto(blob);
    setPreview(URL.createObjectURL(blob));
  };

  const clearPhoto = () => {
    setPhoto(null);
    setPreview(null);
    if (input.current) input.current.value = '';
  };

  const submit = async () => {
    setError(null);
    try {
      const result = await deliver.mutateAsync({ dropId: drop.id, note, photo });
      toast.success(result.deliveredOnTime ? 'Delivered on time' : 'Delivered (late)');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? (err.issues[0]?.message ?? err.message) : 'Could not save. Check your connection and try again.');
    }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && !deliver.isPending && onClose()}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Mark delivered</SheetTitle>
          <SheetDescription>
            {drop.company.name} · {drop.address.label} · {drop.boxes} {drop.boxes === 1 ? 'box' : 'boxes'}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4">
          <div className="space-y-1.5">
            <Label htmlFor="drop-note">Note (optional)</Label>
            <Textarea
              id="drop-note"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="e.g. Handed to reception, signed by Priya"
              className="text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="drop-photo">Photo (optional)</Label>
            <input
              ref={input}
              id="drop-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="sr-only"
              onChange={(e) => void choose(e.target.files?.[0])}
            />
            {preview ? (
              <div className="relative w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                <img src={preview} alt="Delivery photo preview" className="max-h-48 rounded-lg border object-cover" />
                <Button type="button" size="icon" variant="secondary" className="absolute top-1 right-1 size-8" aria-label="Remove photo" onClick={clearPhoto}>
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <Button type="button" variant="outline" className="h-12 w-full" disabled={preparing} onClick={() => input.current?.click()}>
                {preparing ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
                {preparing ? 'Preparing photo…' : 'Take or choose a photo'}
              </Button>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <SheetFooter>
          <Button className="h-12 text-base" disabled={deliver.isPending || preparing} onClick={submit}>
            {deliver.isPending && <Loader2 className="size-5 animate-spin" />}
            Confirm delivery
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
