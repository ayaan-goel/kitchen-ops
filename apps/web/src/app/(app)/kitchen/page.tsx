'use client';

import type { KitchenUnitDto } from '@fernleaf/shared';
import { ListChecks, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import { Forbidden } from '@/components/forbidden';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useKitchenBoard, useUnitAction } from '@/features/kitchen/api';
import { DateNav } from '@/features/kitchen/date-nav';
import { UnitCard } from '@/features/kitchen/unit-card';
import { hasPermission, useMe } from '@/lib/auth';
import { formatKitchen, useMeta } from '@/lib/kitchen-time';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'late' | 'risk' | 'todo' | 'done';
const UNASSIGNED = 'unassigned';

function KitchenBoard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: me } = useMe();
  const meta = useMeta().data;
  const today = meta?.today ?? null;
  const date = params.get('date') ?? today;
  const station = params.get('station') ?? 'all';
  const filter = (params.get('show') ?? 'all') as Filter;
  const zone = meta?.kitchenTimeZone ?? 'Asia/Kolkata';

  const { data: board, isPending, isFetching, refetch, error } = useKitchenBoard(date);
  const action = useUnitAction(date ?? '');
  const canWork = hasPermission(me, 'kitchen.work');

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  };

  const visible = useMemo(() => {
    if (!board) return [];
    return board.units.filter((u) => {
      if (station !== 'all' && (station === UNASSIGNED ? u.stationId !== null : u.stationId !== station)) return false;
      if (filter === 'late') return u.risk === 'LATE';
      if (filter === 'risk') return u.risk === 'AT_RISK' || u.risk === 'LATE';
      if (filter === 'todo') return u.status !== 'DONE';
      if (filter === 'done') return u.status === 'DONE';
      return true;
    });
  }, [board, station, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, KitchenUnitDto[]>();
    for (const u of visible) map.set(u.plannedKitchenReadyAt, [...(map.get(u.plannedKitchenReadyAt) ?? []), u]);
    return [...map.entries()];
  }, [visible]);

  if (me && !hasPermission(me, 'kitchen.read')) return <Forbidden />;
  if (!date || !today) return <Skeleton className="h-96 w-full" />;

  const all = board?.units ?? [];
  const counts = {
    late: all.filter((u) => u.risk === 'LATE').length,
    risk: all.filter((u) => u.risk === 'AT_RISK' || u.risk === 'LATE').length,
    todo: all.filter((u) => u.status !== 'DONE').length,
    done: all.filter((u) => u.status === 'DONE').length,
  };
  const chips: { key: Filter; label: string; count: number; tone?: string }[] = [
    { key: 'all', label: 'All units', count: all.length },
    { key: 'late', label: 'Late', count: counts.late, tone: 'late' },
    { key: 'risk', label: 'Late + at risk', count: counts.risk, tone: 'risk' },
    { key: 'todo', label: 'Not done', count: counts.todo },
    { key: 'done', label: 'Done', count: counts.done },
  ];

  return (
    <>
      <PageHeader
        title="Kitchen board"
        description="Prep units of confirmed orders, by station. Each unit is one combination of one order line."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DateNav date={date} today={today} onChange={(d) => setParam('date', d === today ? null : d)} />
            <Button variant="outline" size="icon" aria-label="Refresh" onClick={() => refetch()}>
              <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/kitchen/summary${date !== today ? `?date=${date}` : ''}`}>
                <ListChecks className="size-4" /> Cook list
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setParam('show', c.key === 'all' ? null : c.key)}
            aria-pressed={filter === c.key}
            className={cn(
              'rounded-full border px-3 py-1 text-sm',
              filter === c.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              c.tone === 'late' && c.count > 0 && filter !== c.key && 'border-status-late text-status-late',
              c.tone === 'risk' && c.count > 0 && filter !== c.key && 'border-status-risk',
            )}
          >
            {c.label} <span className="tabular-nums">({c.count})</span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Stations">
        <StationTab active={station === 'all'} onClick={() => setParam('station', null)} name="All stations" todo={counts.todo} total={all.length} late={counts.late} />
        {board?.stations.map((s) => {
          // Counted from the units (not the server summary) so optimistic updates show at once.
          const own = all.filter((u) => u.stationId === s.id);
          return (
            <StationTab
              key={s.id ?? UNASSIGNED}
              active={station === (s.id ?? UNASSIGNED)}
              onClick={() => setParam('station', s.id ?? UNASSIGNED)}
              name={s.name}
              todo={own.filter((u) => u.status !== 'DONE').length}
              total={own.length}
              late={own.filter((u) => u.risk === 'LATE').length}
            />
          );
        })}
      </div>

      {isPending && <Skeleton className="h-64 w-full" />}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {board && visible.length === 0 && (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          {all.length === 0 ? 'No confirmed orders for this date yet.' : 'Nothing matches this filter.'}
        </div>
      )}

      <div className="space-y-6">
        {groups.map(([readyBy, units]) => (
          <section key={readyBy} aria-label={`Ready by ${formatKitchen(readyBy, zone)}`}>
            <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
              Ready by {formatKitchen(readyBy, zone)} IST
              <span className="font-normal text-muted-foreground">
                · {units.reduce((s, u) => s + u.quantity, 0)} boxes · {units.filter((u) => u.status !== 'DONE').length} to do
              </span>
            </h2>
            <div className="space-y-2">
              {units.map((u) => (
                <UnitCard
                  key={u.id}
                  unit={u}
                  zone={zone}
                  canWork={canWork}
                  busy={action.isPending && action.variables?.unitId === u.id}
                  onAction={(a) => action.mutate({ unitId: u.id, action: a })}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function StationTab({ active, onClick, name, todo, total, late }: { active: boolean; onClick: () => void; name: string; todo: number; total: number; late: number }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex shrink-0 flex-col items-start rounded-lg border px-3 py-2 text-left text-sm',
        active ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'bg-card hover:bg-accent',
      )}
    >
      <span className="font-medium">{name}</span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {todo} to do / {total}
        {late > 0 && <span className="ml-1 font-medium text-status-late">· {late} late</span>}
      </span>
    </button>
  );
}

export default function KitchenPage() {
  return (
    <Suspense>
      <KitchenBoard />
    </Suspense>
  );
}
