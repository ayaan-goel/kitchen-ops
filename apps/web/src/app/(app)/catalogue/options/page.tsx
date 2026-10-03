'use client';

import type { OptionDto } from '@fernleaf/shared';
import { Loader2, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ChipPicker } from '@/components/chip-picker';
import { Forbidden } from '@/components/forbidden';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { errorText, useOptions, useReference, useSaveOption } from '@/features/catalogue/api';
import { centsToInput, MoneyInput } from '@/features/catalogue/money-input';
import { hasPermission, useMe } from '@/lib/auth';
import { formatCents, parseDollarsToCents } from '@/lib/format';

/** Options are shared across dishes; each dish's option groups pick from this list (CAT-03). */
export default function OptionsPage() {
  const { data: me } = useMe();
  const { data, isPending, error } = useOptions();
  const sizes = useReference('portion-sizes').data ?? [];
  const allergens = useReference('allergens').data ?? [];
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<OptionDto | 'new' | null>(null);
  if (me && !hasPermission(me, 'catalogue.read')) return <Forbidden />;
  const canManage = hasPermission(me, 'catalogue.manage');
  const sizeName = new Map(sizes.map((s) => [s.id, s.name]));
  const allergenName = new Map(allergens.map((a) => [a.id, a.name]));
  const rows = (data ?? []).filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <PageHeader
        title="Options"
        description="Choices like proteins, bases and add-ons. Prices per tier are set on the Pricing page; sizes add a flat surcharge."
        actions={
          canManage ? (
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" /> New option
            </Button>
          ) : undefined
        }
      />
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search options" className="pl-8" aria-label="Search options" />
      </div>
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Option</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="hidden md:table-cell">Sizes (+ surcharge)</TableHead>
              <TableHead className="hidden lg:table-cell">Allergens</TableHead>
              <TableHead className="text-right">Used by</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-24 w-full" />
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={6} className="text-sm text-destructive">
                  {error.message}
                </TableCell>
              </TableRow>
            )}
            {rows.map((o) => (
              <TableRow key={o.id} className={canManage ? 'cursor-pointer' : undefined} onClick={() => canManage && setEditing(o)}>
                <TableCell className="font-medium">{o.name}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCents(o.costCents)}</TableCell>
                <TableCell className="hidden text-sm md:table-cell">
                  {o.portions.length ? o.portions.map((p) => `${sizeName.get(p.portionSizeId) ?? '?'}${p.extraCents ? ` +${formatCents(p.extraCents)}` : ''}`).join(', ') : '—'}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{o.allergenIds.map((a) => allergenName.get(a) ?? '?').join(', ') || '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{o.usedByDishes} {o.usedByDishes === 1 ? 'dish' : 'dishes'}</TableCell>
                <TableCell className="text-sm">{o.isActive ? 'Active' : <span className="text-muted-foreground">Inactive</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editing && <OptionDialog option={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function OptionDialog({ option, onClose }: { option: OptionDto | null; onClose: () => void }) {
  const sizes = useReference('portion-sizes').data ?? [];
  const allergens = useReference('allergens').data ?? [];
  const tags = useReference('dietary-tags').data ?? [];
  const save = useSaveOption();
  const [name, setName] = useState(option?.name ?? '');
  const [description, setDescription] = useState(option?.description ?? '');
  const [cost, setCost] = useState(centsToInput(option?.costCents ?? null));
  const [isActive, setIsActive] = useState(option?.isActive ?? true);
  const [allergenIds, setAllergenIds] = useState(option?.allergenIds ?? []);
  const [tagIds, setTagIds] = useState(option?.dietaryTagIds ?? []);
  const [portions, setPortions] = useState<Record<string, string>>(Object.fromEntries((option?.portions ?? []).map((p) => [p.portionSizeId, centsToInput(p.extraCents)])));
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const costCents = parseDollarsToCents(cost);
    if (costCents === null) return setError('Enter the cost in dollars, e.g. 0.80');
    const portionList = Object.entries(portions).map(([portionSizeId, v]) => ({ portionSizeId, extraCents: v.trim() === '' ? 0 : parseDollarsToCents(v) }));
    if (portionList.some((p) => p.extraCents === null)) return setError('Size surcharges must be dollar amounts.');
    try {
      await save.mutateAsync({
        id: option?.id,
        input: { name, description, costCents, isActive, allergenIds, dietaryTagIds: tagIds, portions: portionList.map((p) => ({ portionSizeId: p.portionSizeId, extraCents: p.extraCents! })) },
      });
      toast.success(option ? 'Option saved' : 'Option created');
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{option ? `Edit ${option.name}` : 'New option'}</DialogTitle>
          <DialogDescription>{option?.usedByDishes ? `Used by ${option.usedByDishes} dishes. Existing orders keep the prices they were placed with.` : 'Add it to dishes from the dish page.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <div className="space-y-1.5">
              <Label htmlFor="opt-name">Name</Label>
              <Input id="opt-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opt-cost">Cost</Label>
              <MoneyInput id="opt-cost" value={cost} onChange={setCost} placeholder="0.80" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="opt-desc">Description</Label>
            <Textarea id="opt-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Allergens</Label>
            <ChipPicker label="Allergens" items={allergens} value={allergenIds} onChange={setAllergenIds} />
          </div>
          <div className="space-y-1.5">
            <Label>Dietary tags</Label>
            <ChipPicker label="Dietary tags" items={tags} value={tagIds} onChange={setTagIds} />
          </div>
          <div className="space-y-1.5">
            <Label>Sold in sizes</Label>
            <p className="text-xs text-muted-foreground">Only needed if a dish offers this option in sizes. The surcharge is added to the tier price.</p>
            <div className="space-y-2">
              {sizes
                .filter((s) => s.isActive || s.id in portions)
                .map((s) => (
                  <div key={s.id} className="flex items-center gap-3">
                    <Label className="flex w-32 items-center gap-2 font-normal">
                      <Checkbox
                        checked={s.id in portions}
                        onCheckedChange={(v) =>
                          setPortions((p) => {
                            const next = { ...p };
                            if (v === true) next[s.id] = '0.00';
                            else delete next[s.id];
                            return next;
                          })
                        }
                      />
                      {s.name}
                    </Label>
                    {s.id in portions && (
                      <div className="w-32">
                        <MoneyInput aria-label={`${s.name} surcharge`} value={portions[s.id]!} onChange={(v) => setPortions((p) => ({ ...p, [s.id]: v }))} />
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
          <Label className="flex items-center gap-2 font-normal">
            <Switch checked={isActive} onCheckedChange={setIsActive} /> Active (inactive options disappear from every menu)
          </Label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.isPending || !name.trim()}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
