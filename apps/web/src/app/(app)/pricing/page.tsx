'use client';

import { formatMultiplierBps, parseMultiplierToBps } from '@fernleaf/domain';
import type { PriceTierDto } from '@fernleaf/shared';
import { AlertTriangle, Loader2, Plus, Star } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Forbidden } from '@/components/forbidden';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { errorText, useMakeDefaultTier, useSaveTier, useTiers } from '@/features/catalogue/api';
import { hasPermission, useMe } from '@/lib/auth';

const RULE: Record<PriceTierDto['derivation'], string> = {
  MANUAL: 'Prices typed in',
  FROM_COST: 'Cost price',
  FROM_TIER: 'Another tier',
};

function describeTier(t: PriceTierDto): string {
  if (t.derivation === 'MANUAL') return 'Every price is typed in.';
  const m = t.multiplierBps ? formatMultiplierBps(t.multiplierBps) : '?';
  return t.derivation === 'FROM_COST' ? `Cost ${m}, rounded up to 5¢. Overrides win.` : `${t.baseTierName ?? '?'} ${m}, rounded up to 5¢. Overrides win.`;
}

/** Price tiers (PRICE-01…06). Each company is priced on one tier; unassigned companies use the default. */
export default function PricingPage() {
  const { data: me } = useMe();
  const { data, isPending, error } = useTiers();
  const makeDefault = useMakeDefaultTier();
  const [editing, setEditing] = useState<PriceTierDto | 'new' | null>(null);
  if (me && !hasPermission(me, 'pricing.read')) return <Forbidden />;
  const canManage = hasPermission(me, 'pricing.manage');

  return (
    <>
      <PageHeader
        title="Pricing"
        description="Tiers are price lists. A tier can be typed in, or derived from cost or from another tier with a multiplier; explicit prices override the rule."
        actions={
          canManage ? (
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" /> New tier
            </Button>
          ) : undefined
        }
      />
      {isPending && <Skeleton className="h-48 w-full" />}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {data?.map((t) => (
          <article key={t.id} className="flex flex-col rounded-xl border bg-card p-4">
            <div className="mb-1 flex items-start justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                {t.name}
                {t.isDefault && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                    <Star className="size-3" aria-hidden /> Default
                  </span>
                )}
              </h2>
              <span className="text-xs text-muted-foreground">{RULE[t.derivation]}</span>
            </div>
            <p className="text-sm">{describeTier(t)}</p>
            {t.description && <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>}
            <p className="mt-2 text-sm text-muted-foreground">
              {t.companies} {t.companies === 1 ? 'company' : 'companies'}
              {t.isDefault ? ' + every company without a tier' : ''}
            </p>
            {(t.missingDishes > 0 || t.missingOptions > 0) && (
              <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-status-late">
                <AlertTriangle className="size-4" aria-hidden /> Missing prices: {t.missingDishes} dishes, {t.missingOptions} options (hidden from these companies’ menus)
              </p>
            )}
            <div className="mt-auto flex flex-wrap gap-2 pt-4">
              <Button size="sm" asChild>
                <Link href={`/pricing/${t.id}`}>Open price grid</Link>
              </Button>
              {canManage && (
                <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                  Edit rule
                </Button>
              )}
              {canManage && !t.isDefault && (
                <Button size="sm" variant="ghost" disabled={makeDefault.isPending} onClick={() => makeDefault.mutate(t.id, { onSuccess: () => toast.success(`${t.name} is now the default tier`) })}>
                  Make default
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
      {editing && <TierDialog tier={editing === 'new' ? null : editing} tiers={data ?? []} onClose={() => setEditing(null)} />}
    </>
  );
}

function TierDialog({ tier, tiers, onClose }: { tier: PriceTierDto | null; tiers: PriceTierDto[]; onClose: () => void }) {
  const save = useSaveTier();
  const [name, setName] = useState(tier?.name ?? '');
  const [description, setDescription] = useState(tier?.description ?? '');
  const [derivation, setDerivation] = useState<PriceTierDto['derivation']>(tier?.derivation ?? 'FROM_TIER');
  const [baseTierId, setBaseTierId] = useState(tier?.baseTierId ?? tiers.find((t) => t.isDefault)?.id ?? '');
  const [multiplier, setMultiplier] = useState(tier?.multiplierBps ? formatMultiplierBps(tier.multiplierBps).split(' ')[0]!.replace('×', '') : '');
  const [error, setError] = useState<string | null>(null);
  const bps = derivation === 'MANUAL' ? null : parseMultiplierToBps(multiplier);

  const submit = async () => {
    setError(null);
    if (derivation !== 'MANUAL' && bps === null) return setError('Enter a multiplier like 2.4 or +15% / -10%.');
    try {
      await save.mutateAsync({
        id: tier?.id,
        input: { name, description, derivation, baseTierId: derivation === 'FROM_TIER' ? baseTierId || null : null, multiplierBps: bps },
      });
      toast.success(tier ? 'Tier saved; derived prices update immediately' : 'Tier created');
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tier ? `Edit ${tier.name}` : 'New price tier'}</DialogTitle>
          <DialogDescription>Rule changes apply to new orders at once. Placed orders keep the prices they captured.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="t-name">Name</Label>
            <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-rule">Prices come from</Label>
            <Select value={derivation} onValueChange={(v) => setDerivation(v as PriceTierDto['derivation'])}>
              <SelectTrigger id="t-rule" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FROM_TIER">Another tier × multiplier</SelectItem>
                <SelectItem value="FROM_COST">Cost price × multiplier</SelectItem>
                <SelectItem value="MANUAL">Typed in (no rule)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {derivation === 'FROM_TIER' && (
            <div className="space-y-1.5">
              <Label htmlFor="t-base">Base tier</Label>
              <Select value={baseTierId} onValueChange={setBaseTierId}>
                <SelectTrigger id="t-base" className="w-full">
                  <SelectValue placeholder="Choose a tier" />
                </SelectTrigger>
                <SelectContent>
                  {tiers
                    .filter((t) => t.id !== tier?.id)
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {derivation !== 'MANUAL' && (
            <div className="space-y-1.5">
              <Label htmlFor="t-mult">Multiplier</Label>
              <Input id="t-mult" value={multiplier} onChange={(e) => setMultiplier(e.target.value)} placeholder="2.4  or  +15%  or  -10%" />
              <p className="text-xs text-muted-foreground">{bps ? `= ${formatMultiplierBps(bps)}. Results round up to the next 5¢.` : 'Type a factor (2.4) or a percentage change (+15%, -10%).'}</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="t-desc">Description</Label>
            <Textarea id="t-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
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
