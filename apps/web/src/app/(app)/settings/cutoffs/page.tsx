'use client';

import type { CutoffDayDto } from '@fernleaf/shared';
import { Loader2, Play, RotateCw, TimerOff } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Forbidden } from '@/components/forbidden';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCutoffDays, useRunCutoff } from '@/features/orders/api';
import { ApiError } from '@/lib/api-client';
import { hasPermission, useMe } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { formatKitchen, useMeta } from '@/lib/kitchen-time';
import { cn } from '@/lib/utils';

const STATE: Record<CutoffDayDto['state'], { label: string; className: string }> = {
  OPEN: { label: 'Open for orders', className: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200' },
  DUE: { label: 'Cut-off passed · to process', className: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' },
  PROCESSED: { label: 'Processed', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
  LOCKED: { label: 'Locked', className: 'bg-muted text-muted-foreground' },
};

export default function CutoffConsolePage() {
  const { data: me } = useMe();
  const zone = useMeta().data?.kitchenTimeZone ?? 'Asia/Kolkata';
  const { data: days, isPending } = useCutoffDays();
  const run = useRunCutoff();
  const [closeEarly, setCloseEarly] = useState<CutoffDayDto | null>(null);

  if (me && !hasPermission(me, 'cutoff.run')) return <Forbidden />;

  const execute = async (day: CutoffDayDto, early: boolean) => {
    try {
      const r = await run.mutateAsync({ date: day.date, closeEarly: early });
      toast.success(
        r.confirmed + r.cancelled === 0
          ? `${formatDate(day.date)}: nothing to change (run #${r.runCount}, safe to repeat)`
          : `${formatDate(day.date)}: ${r.confirmed} confirmed, ${r.cancelled} drafts cancelled`,
      );
      setCloseEarly(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not run the cut-off');
    }
  };

  return (
    <>
      <PageHeader
        title="Cut-off console"
        description="Orders for a date lock at the cut-off. Processing then cancels drafts and confirms placed orders (they become billable and go to the kitchen). It runs automatically; you can run it again safely at any time."
      />
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Delivery date</TableHead>
              <TableHead>Cut-off (IST)</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="text-right">Drafts</TableHead>
              <TableHead className="text-right">Placed</TableHead>
              <TableHead className="text-right">Confirmed</TableHead>
              <TableHead className="hidden md:table-cell">Last run</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={8}>
                  <Skeleton className="h-40 w-full" />
                </TableCell>
              </TableRow>
            )}
            {days?.map((d) => {
              const passed = d.state !== 'OPEN';
              return (
                <TableRow key={d.date}>
                  <TableCell className="font-medium whitespace-nowrap">{formatDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatKitchen(d.cutoffAt, zone, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}
                  </TableCell>
                  <TableCell>
                    <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', STATE[d.state].className)}>{STATE[d.state].label}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{d.counts.draft}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.counts.placed}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.counts.confirmed}</TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {d.lastRun
                      ? `${formatKitchen(d.lastRun.at, zone, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} · ${d.lastRun.trigger.replaceAll('_', ' ').toLowerCase()} · ${d.lastRun.runCount} run${d.lastRun.runCount === 1 ? '' : 's'}`
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {passed ? (
                      <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => execute(d, false)}>
                        {d.state === 'PROCESSED' || d.state === 'LOCKED' ? <RotateCw className="size-4" /> : <Play className="size-4" />}
                        {d.state === 'DUE' ? 'Run now' : 'Re-run'}
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" disabled={run.isPending} onClick={() => setCloseEarly(d)}>
                        <TimerOff className="size-4" /> Close now
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!closeEarly} onOpenChange={(o) => !o && setCloseEarly(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close ordering for {closeEarly ? formatDate(closeEarly.date, { weekday: 'long', day: 'numeric', month: 'long' }) : ''} now?</DialogTitle>
            <DialogDescription>
              This runs the cut-off early: {closeEarly?.counts.draft ?? 0} draft(s) will be cancelled and {closeEarly?.counts.placed ?? 0} placed order(s) confirmed.
              Staff can no longer change orders for this date (admins still can).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseEarly(null)}>
              Keep open
            </Button>
            <Button disabled={run.isPending} onClick={() => closeEarly && execute(closeEarly, true)}>
              {run.isPending && <Loader2 className="size-4 animate-spin" />}
              Close ordering now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
