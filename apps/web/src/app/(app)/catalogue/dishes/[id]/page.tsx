'use client';

import type { DishDetailDto, OptionDto } from '@fernleaf/shared';
import { ArrowDown, ArrowLeft, ArrowUp, Loader2, Plus, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ChipPicker } from '@/components/chip-picker';
import { Forbidden } from '@/components/forbidden';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { errorText, moved, useDish, useOptions, useReference, useSaveDish, useSaveGroups } from '@/features/catalogue/api';
import { centsToInput, MoneyInput } from '@/features/catalogue/money-input';
import { ApiError } from '@/lib/api-client';
import { hasPermission, useMe } from '@/lib/auth';
import { parseDollarsToCents } from '@/lib/format';

const NONE = '__none';

export default function DishPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const { data: me } = useMe();
  const { data: dish, isPending, error } = useDish(isNew ? null : id);
  if (me && !hasPermission(me, 'catalogue.read')) return <Forbidden />;
  if (!isNew && isPending) return <Skeleton className="h-96 w-full" />;
  if (!isNew && (error || !dish)) return <p className="text-sm text-destructive">{error?.message ?? 'Dish not found'}</p>;
  const canManage = hasPermission(me, 'catalogue.manage');

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link href="/catalogue/dishes">
          <ArrowLeft className="size-4" /> Dishes
        </Link>
      </Button>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{isNew ? 'New dish' : dish!.name}</h1>
      {!isNew && (
        <p className="mb-6 text-sm text-muted-foreground">
          {dish!.sku} · {dish!.menuCategories.length ? `On the menu in ${dish!.menuCategories.map((c) => c.name).join(', ')}` : 'Not on the menu yet (add it on the Menu page)'}
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <DishForm key={dish?.id ?? 'new'} dish={dish ?? null} canManage={canManage} />
        {!isNew && dish && <GroupEditor key={JSON.stringify(dish.groups)} dish={dish} canManage={canManage} />}
      </div>
    </>
  );
}

function DishForm({ dish, canManage }: { dish: DishDetailDto | null; canManage: boolean }) {
  const router = useRouter();
  const stations = useReference('stations').data ?? [];
  const allergens = useReference('allergens').data ?? [];
  const tags = useReference('dietary-tags').data ?? [];
  const save = useSaveDish();
  const [f, setF] = useState({
    sku: dish?.sku ?? '',
    name: dish?.name ?? '',
    description: dish?.description ?? '',
    imageUrl: dish?.imageUrl ?? '',
    temperature: dish?.temperature ?? ('HOT' as 'HOT' | 'COLD'),
    cost: centsToInput(dish?.costCents ?? null),
    stationId: dish?.stationId ?? NONE,
    moq: dish?.minOrderQty ? String(dish.minOrderQty) : '',
    isActive: dish?.isActive ?? true,
    allergenIds: dish?.allergenIds ?? [],
    dietaryTagIds: dish?.dietaryTagIds ?? [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    const costCents = parseDollarsToCents(f.cost);
    if (costCents === null) return setErrors({ costCents: 'Enter the cost in dollars, e.g. 2.40' });
    const moq = f.moq.trim() ? Number(f.moq) : null;
    try {
      const saved = await save.mutateAsync({
        id: dish?.id,
        input: {
          sku: f.sku,
          name: f.name,
          description: f.description,
          imageUrl: f.imageUrl,
          temperature: f.temperature,
          costCents,
          stationId: f.stationId === NONE ? null : f.stationId,
          minOrderQty: moq,
          isActive: f.isActive,
          allergenIds: f.allergenIds,
          dietaryTagIds: f.dietaryTagIds,
        },
      });
      setErrors({});
      toast.success(dish ? 'Dish saved' : 'Dish created');
      if (!dish) router.replace(`/catalogue/dishes/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.issues.length) setErrors(Object.fromEntries(err.issues.map((i) => [String(i.path[0]), i.message])));
      else toast.error(errorText(err));
    }
  };
  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Details</CardTitle>
        <CardDescription>Changes apply to new orders only; placed orders keep their snapshot.</CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!canManage} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" value={f.sku} onChange={(e) => set('sku', e.target.value.toUpperCase())} placeholder="FL-BWL-010" className="font-mono" />
              {err('sku')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={f.name} onChange={(e) => set('name', e.target.value)} />
              {err('name')}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" value={f.description} onChange={(e) => set('description', e.target.value)} rows={2} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="cost">Cost price</Label>
              <MoneyInput id="cost" value={f.cost} onChange={(v) => set('cost', v)} placeholder="2.40" />
              {err('costCents')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="temp">Served</Label>
              <Select value={f.temperature} onValueChange={(v) => set('temperature', v as 'HOT' | 'COLD')}>
                <SelectTrigger id="temp" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HOT">Hot</SelectItem>
                  <SelectItem value="COLD">Cold</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="moq">Min. per order</Label>
              <Input id="moq" inputMode="numeric" value={f.moq} onChange={(e) => set('moq', e.target.value.replace(/\D/g, ''))} placeholder="none" />
              {err('minOrderQty')}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="station">Kitchen station</Label>
            <Select value={f.stationId} onValueChange={(v) => set('stationId', v)}>
              <SelectTrigger id="station" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned (shows under “Unassigned” on the board)</SelectItem>
                {stations
                  .filter((s) => s.isActive || s.id === f.stationId)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="img">Image link (https)</Label>
            <Input id="img" value={f.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} placeholder="https://…" />
            {err('imageUrl')}
            {/^https:\/\/\S+$/.test(f.imageUrl) && (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary external preview
              <img src={f.imageUrl} alt="" className="mt-2 h-28 w-40 rounded-md border object-cover" />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Allergens</Label>
            <ChipPicker label="Allergens" items={allergens} value={f.allergenIds} onChange={(v) => set('allergenIds', v)} />
            <p className="text-xs text-muted-foreground">The kitchen board also shows the allergens of the chosen options.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Dietary tags</Label>
            <ChipPicker label="Dietary tags" items={tags} value={f.dietaryTagIds} onChange={(v) => set('dietaryTagIds', v)} />
          </div>
          <Label className="flex items-center gap-2 font-normal">
            <Switch checked={f.isActive} onCheckedChange={(v) => set('isActive', v)} /> Active (inactive dishes vanish from every menu but stay on past orders)
          </Label>
          {canManage && (
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />} {dish ? 'Save details' : 'Create dish'}
            </Button>
          )}
        </fieldset>
      </CardContent>
    </Card>
  );
}

interface GroupDraft {
  key: string;
  id?: string;
  name: string;
  isRequired: boolean;
  maxSelections: number;
  usesPortions: boolean;
  optionIds: string[];
  portionSizeIds: string[];
}

function GroupEditor({ dish, canManage }: { dish: DishDetailDto; canManage: boolean }) {
  const options = useOptions().data ?? [];
  const sizes = useReference('portion-sizes').data ?? [];
  const save = useSaveGroups(dish.id);
  const [groups, setGroups] = useState<GroupDraft[]>(dish.groups.map((g) => ({ ...g, key: g.id })));
  const [issues, setIssues] = useState<{ path: (string | number)[]; message: string }[]>([]);
  const optionById = new Map(options.map((o) => [o.id, o]));
  const dirty = JSON.stringify(groups.map(({ key: _key, ...g }) => g)) !== JSON.stringify(dish.groups);

  const update = (key: string, change: Partial<GroupDraft>) => setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, ...change } : g)));
  const issuesFor = (i: number) => issues.filter((x) => x.path[0] === 'groups' && x.path[1] === i);

  const submit = async () => {
    setIssues([]);
    try {
      await save.mutateAsync({ groups: groups.map(({ key: _key, ...g }) => g) });
      toast.success('Option groups saved');
    } catch (err) {
      if (err instanceof ApiError && err.issues.length) setIssues(err.issues);
      else toast.error(errorText(err));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Option groups</CardTitle>
        <CardDescription>What employees choose for this dish, e.g. “Choose your protein” (required, 1). Groups with sizes price each size with a surcharge.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.length === 0 && <p className="text-sm text-muted-foreground">No choices: the dish is ordered as it is.</p>}
        {groups.map((g, i) => (
          <fieldset key={g.key} disabled={!canManage} className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1 space-y-1">
                <Label htmlFor={`g-${g.key}`}>Group name</Label>
                <Input id={`g-${g.key}`} value={g.name} onChange={(e) => update(g.key, { name: e.target.value })} placeholder="Choose your protein" />
              </div>
              <div className="w-28 space-y-1">
                <Label htmlFor={`m-${g.key}`}>Max choices</Label>
                <Input id={`m-${g.key}`} inputMode="numeric" value={String(g.maxSelections)} onChange={(e) => update(g.key, { maxSelections: Number(e.target.value.replace(/\D/g, '') || 0) })} />
              </div>
              <div className="flex gap-1">
                <Button type="button" size="icon" variant="ghost" aria-label="Move group up" disabled={i === 0} onClick={() => setGroups((gs) => moved(gs.map((x) => x.key), g.key, -1).map((k) => gs.find((x) => x.key === k)!))}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" aria-label="Move group down" disabled={i === groups.length - 1} onClick={() => setGroups((gs) => moved(gs.map((x) => x.key), g.key, 1).map((k) => gs.find((x) => x.key === k)!))}>
                  <ArrowDown className="size-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" aria-label="Remove group" onClick={() => setGroups((gs) => gs.filter((x) => x.key !== g.key))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <Label className="flex items-center gap-2 font-normal">
                <Switch checked={g.isRequired} onCheckedChange={(v) => update(g.key, { isRequired: v })} /> Required
              </Label>
              <Label className="flex items-center gap-2 font-normal">
                <Switch checked={g.usesPortions} onCheckedChange={(v) => update(g.key, { usesPortions: v, portionSizeIds: v ? g.portionSizeIds : [] })} /> Sold in sizes
              </Label>
            </div>
            {g.usesPortions && (
              <div className="space-y-1">
                <Label>Sizes</Label>
                <ChipPicker label="Sizes" items={sizes} value={g.portionSizeIds} onChange={(v) => update(g.key, { portionSizeIds: v })} />
              </div>
            )}
            <div className="space-y-1">
              <Label>Options (in display order)</Label>
              <ul className="space-y-1">
                {g.optionIds.map((oid) => {
                  const o = optionById.get(oid);
                  return (
                    <li key={oid} className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1 text-sm">
                      <span className="flex-1">
                        {o?.name ?? '…'}
                        {o && !o.isActive && <span className="ml-1 text-xs text-muted-foreground">(inactive)</span>}
                      </span>
                      <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Move option up" onClick={() => update(g.key, { optionIds: moved(g.optionIds, oid, -1) })}>
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Move option down" onClick={() => update(g.key, { optionIds: moved(g.optionIds, oid, 1) })}>
                        <ArrowDown className="size-3.5" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="size-7" aria-label={`Remove ${o?.name ?? 'option'}`} onClick={() => update(g.key, { optionIds: g.optionIds.filter((x) => x !== oid) })}>
                        <X className="size-3.5" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
              {canManage && <AddOption options={options} exclude={g.optionIds} onAdd={(oid) => update(g.key, { optionIds: [...g.optionIds, oid] })} />}
            </div>
            {issuesFor(i).map((x, k) => (
              <p key={k} className="text-xs text-destructive">
                {x.message}
              </p>
            ))}
          </fieldset>
        ))}
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setGroups((gs) => [...gs, { key: crypto.randomUUID(), name: '', isRequired: false, maxSelections: 1, usesPortions: false, optionIds: [], portionSizeIds: [] }])}
            >
              <Plus className="size-4" /> Add group
            </Button>
            <Button type="button" onClick={submit} disabled={save.isPending || !dirty}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />} Save option groups
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AddOption({ options, exclude, onAdd }: { options: OptionDto[]; exclude: string[]; onAdd: (id: string) => void }) {
  const available = options.filter((o) => o.isActive && !exclude.includes(o.id));
  return (
    <Select value="" onValueChange={onAdd}>
      <SelectTrigger size="sm" className="w-full sm:w-72" aria-label="Add option">
        <SelectValue placeholder="+ Add an option…" />
      </SelectTrigger>
      <SelectContent>
        {available.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
