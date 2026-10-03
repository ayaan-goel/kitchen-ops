'use client';

import { formatMultiplierBps } from '@fernleaf/domain';
import type { TierGridRowDto } from '@fernleaf/shared';
import { ArrowLeft, Check, Pencil, RotateCcw, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Forbidden } from '@/components/forbidden';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSetPrice, useTierGrid } from '@/features/catalogue/api';
import { centsToInput, MoneyInput } from '@/features/catalogue/money-input';
import { hasPermission, useMe } from '@/lib/auth';
import { formatCents, parseDollarsToCents } from '@/lib/format';
import { cn } from '@/lib/utils';

const SOURCE: Record<TierGridRowDto['source'], { label: string; cls: string }> = {
  EXPLICIT: { label: 'Typed in', cls: 'text-foreground' },
  OVERRIDE: { label: 'Override', cls: 'text-primary' },
  DERIVED: { label: 'From rule', cls: 'text-muted-foreground' },
  MISSING: { label: 'Missing', cls: 'font-semibold text-status-late' },
};

/** The whole tier at a glance (PRICE-07): what each item costs, what the rule gives, what wins. */
function TierGrid() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: me } = useMe();
  const kind = params.get('kind') === 'options' ? 'options' : 'dishes';
  const missingOnly = params.get('missing') === '1';
  const [q, setQ] = useState('');
  const { data, isPending, error } = useTierGrid(id, kind);
  const setPrice = useSetPrice(id);
  const [editing, setEditing] = useState<{ itemId: string; value: string } | null>(null);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  };
  if (me && !hasPermission(me, 'pricing.read')) return <Forbidden />;
  const canManage = hasPermission(me, 'pricing.manage');
  const tier = data?.tier;
  const derived = tier && tier.derivation !== 'MANUAL';
  const rows = (data?.rows ?? []).filter(
    (r) => (!missingOnly || (r.source === 'MISSING' && r.isActive)) && `${r.name} ${r.sku ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()),
  );

  const commit = (row: TierGridRowDto) => {
    if (!editing) return;
    const cents = editing.value.trim() === '' ? null : parseDollarsToCents(editing.value);
    if (editing.value.trim() !== '' && cents === null) return;
    setPrice.mutate({ kind, itemId: row.itemId, priceCents: cents }, { onSuccess: () => setEditing(null) });
  };

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link href="/pricing">
          <ArrowLeft className="size-4" /> Pricing
        </Link>
      </Button>
      <h1 className="text-2xl font-semibold tracking-tight">{tier ? `${tier.name} prices` : 'Prices'}</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        {tier
          ? tier.derivation === 'MANUAL'
            ? 'Every price on this tier is typed in. Items without a price are hidden from the menus of companies on this tier.'
            : `Rule: ${tier.derivation === 'FROM_COST' ? 'cost' : tier.baseTierName} ${tier.multiplierBps ? formatMultiplierBps(tier.multiplierBps) : ''}, rounded up to 5¢. Type a price to override it; clear the override to go back to the rule.`
          : ' '}
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Tabs value={kind} onValueChange={(k) => setParam('kind', k === 'dishes' ? null : k)}>
          <TabsList>
            <TabsTrigger value="dishes">Dishes{tier ? ` (${tier.missingDishes} missing)` : ''}</TabsTrigger>
            <TabsTrigger value="options">Options{tier ? ` (${tier.missingOptions} missing)` : ''}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-56">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" className="pl-8" aria-label="Filter items" />
        </div>
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={missingOnly} onCheckedChange={(v) => setParam('missing', v === true ? '1' : null)} /> Missing only
        </Label>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{kind === 'dishes' ? 'Dish' : 'Option'}</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              {derived && <TableHead className="text-right">From rule</TableHead>}
              <TableHead className="text-right">{derived ? 'Override' : 'Price'}</TableHead>
              <TableHead className="text-right">Effective</TableHead>
              <TableHead className="hidden sm:table-cell">Source</TableHead>
              <TableHead className="hidden md:table-cell text-right">Margin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Skeleton className="h-40 w-full" />
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={7} className="text-sm text-destructive">
                  {error.message}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const margin = r.effectiveCents && r.effectiveCents > 0 ? Math.round(((r.effectiveCents - r.costCents) / r.effectiveCents) * 100) : null;
              return (
                <TableRow key={r.itemId} className={r.isActive ? undefined : 'opacity-50'}>
                  <TableCell>
                    <span className="font-medium">{r.name}</span>
                    {r.sku && <span className="ml-2 font-mono text-xs text-muted-foreground">{r.sku}</span>}
                    {!r.isActive && <span className="ml-2 text-xs text-muted-foreground">inactive</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{formatCents(r.costCents)}</TableCell>
                  {derived && <TableCell className="text-right tabular-nums text-muted-foreground">{r.derivedCents === null ? '—' : formatCents(r.derivedCents)}</TableCell>}
                  <TableCell className="text-right">
                    {editing?.itemId === r.itemId ? (
                      <form
                        className="ml-auto flex w-40 items-center gap-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          commit(r);
                        }}
                      >
                        <MoneyInput autoFocus aria-label={`Price for ${r.name}`} value={editing.value} onChange={(v) => setEditing({ itemId: r.itemId, value: v })} className="h-8 pl-6" />
                        <Button type="submit" size="icon" variant="ghost" className="size-7" aria-label="Save price" disabled={setPrice.isPending}>
                          <Check className="size-4" />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Cancel" onClick={() => setEditing(null)}>
                          <X className="size-4" />
                        </Button>
                      </form>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <span className="tabular-nums">{r.explicitCents === null ? '—' : formatCents(r.explicitCents)}</span>
                        {canManage && (
                          <Button size="icon" variant="ghost" className="size-7" aria-label={`Edit price for ${r.name}`} onClick={() => setEditing({ itemId: r.itemId, value: centsToInput(r.explicitCents) })}>
                            <Pencil className="size-3.5" />
                          </Button>
                        )}
                        {canManage && r.explicitCents !== null && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            aria-label={derived ? `Clear override for ${r.name}` : `Remove price for ${r.name}`}
                            title={derived ? 'Clear override (use the rule)' : 'Remove price (item becomes unavailable on this tier)'}
                            onClick={() => setPrice.mutate({ kind, itemId: r.itemId, priceCents: null })}
                          >
                            <RotateCcw className="size-3.5" />
                          </Button>
                        )}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{r.effectiveCents === null ? '—' : formatCents(r.effectiveCents)}</TableCell>
                  <TableCell className={cn('hidden text-sm sm:table-cell', SOURCE[r.source].cls)}>{SOURCE[r.source].label}</TableCell>
                  <TableCell className={cn('hidden text-right text-sm tabular-nums md:table-cell', margin !== null && margin < 30 && 'text-status-late')}>{margin === null ? '—' : `${margin}%`}</TableCell>
                </TableRow>
              );
            })}
            {data && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  {missingOnly ? 'Nothing is missing on this tier.' : 'No items match.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export default function TierGridPage() {
  return (
    <Suspense>
      <TierGrid />
    </Suspense>
  );
}
