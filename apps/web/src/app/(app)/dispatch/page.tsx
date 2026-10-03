'use client';

import { DROP_STAGES, type DropStage } from '@fernleaf/shared';
import { RefreshCw } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { DateNav } from '@/components/date-nav';
import { Forbidden } from '@/components/forbidden';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAssignDriver, useDispatchBoard, useDrivers, useDropStep } from '@/features/dispatch/api';
import { STAGE_LABEL } from '@/features/dispatch/drop-bits';
import { DropCard } from '@/features/dispatch/drop-card';
import { hasPermission, useMe } from '@/lib/auth';
import { useMeta } from '@/lib/kitchen-time';
import { cn } from '@/lib/utils';

const STAGE_HINT: Record<DropStage, string> = {
  PENDING: 'Waiting for the kitchen',
  DISPATCH_READY: 'Packed, waiting for a driver',
  OUT_FOR_DELIVERY: 'On the road',
  DELIVERED: 'Done',
};

function DispatchBoard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: me } = useMe();
  const meta = useMeta().data;
  const today = meta?.today ?? null;
  const date = params.get('date') ?? today;
  const zone = meta?.kitchenTimeZone ?? 'Asia/Kolkata';

  const { data: board, isPending, isFetching, refetch, error } = useDispatchBoard(date);
  const { data: drivers = [] } = useDrivers(date);
  const step = useDropStep(date ?? '');
  const assign = useAssignDriver(date ?? '');
  const canManage = hasPermission(me, 'dispatch.manage');

  if (me && !hasPermission(me, 'dispatch.read')) return <Forbidden />;
  if (!date || !today) return <Skeleton className="h-96 w-full" />;

  const drops = board?.drops ?? [];
  const late = drops.filter((d) => d.risk === 'LATE').length;
  const atRisk = drops.filter((d) => d.risk === 'AT_RISK').length;
  const onTime = drops.filter((d) => d.deliveredOnTime === true).length;
  const delivered = drops.filter((d) => d.stage === 'DELIVERED').length;

  return (
    <>
      <PageHeader
        title="Dispatch board"
        description="One card per drop: the orders for one company, address and delivery time travel together."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DateNav
              date={date}
              today={today}
              onChange={(d) => router.replace(d === today ? pathname : `${pathname}?date=${d}`)}
            />
            <Button variant="outline" size="icon" aria-label="Refresh" onClick={() => refetch()}>
              <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
            </Button>
          </div>
        }
      />

      {board && (
        <p className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>
            <span className="font-medium text-foreground tabular-nums">{drops.length}</span> drops ·{' '}
            <span className="tabular-nums">{drops.reduce((n, d) => n + d.boxes, 0)}</span> boxes
          </span>
          {late > 0 && <span className="font-medium text-status-late">{late} late</span>}
          {atRisk > 0 && <span className="font-medium">{atRisk} at risk</span>}
          {delivered > 0 && (
            <span>
              {onTime} of {delivered} delivered on time
            </span>
          )}
        </p>
      )}

      {isPending && <Skeleton className="h-64 w-full" />}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {board && drops.length === 0 && (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">No confirmed orders for this date yet.</div>
      )}

      {board && drops.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {DROP_STAGES.map((stage) => {
            const column = drops.filter((d) => d.stage === stage);
            return (
              <section key={stage} aria-label={STAGE_LABEL[stage]} className="min-w-0 rounded-xl bg-muted/40 p-2">
                <h2 className="mb-2 flex items-baseline justify-between px-1 text-sm font-semibold">
                  <span>
                    {STAGE_LABEL[stage]} <span className="font-normal text-muted-foreground tabular-nums">({column.length})</span>
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">{STAGE_HINT[stage]}</span>
                </h2>
                <div className="space-y-2">
                  {column.map((d) => (
                    <DropCard
                      key={d.id}
                      drop={d}
                      drivers={drivers}
                      zone={zone}
                      canManage={canManage}
                      busy={(step.isPending && step.variables?.dropId === d.id) || (assign.isPending && assign.variables?.dropId === d.id)}
                      onStep={(s, note) => step.mutate({ dropId: d.id, step: s, note })}
                      onAssign={(driver) => assign.mutate({ dropId: d.id, driver })}
                    />
                  ))}
                  {column.length === 0 && <p className="px-1 py-6 text-center text-xs text-muted-foreground">Nothing here</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function DispatchPage() {
  return (
    <Suspense>
      <DispatchBoard />
    </Suspense>
  );
}
