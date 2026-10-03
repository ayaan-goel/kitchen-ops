'use client';

import type { AdminDashboardDto, DashboardDto, DispatchDashboardDto, DriverDashboardDto, KitchenDashboardDto } from '@fernleaf/shared';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, MapPin, Package } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BookedChart } from '@/features/dashboard/booked-chart';
import { Meter, Panel, pct, StatTile } from '@/features/dashboard/bits';
import { apiFetch } from '@/lib/api-client';
import { hasPermission, useMe } from '@/lib/auth';
import { formatCents, formatDate } from '@/lib/format';
import { formatKitchen, useMeta } from '@/lib/kitchen-time';

const QUESTION: Record<DashboardDto['kind'], string> = {
  ADMIN: 'Is today’s service on track, and is the business healthy this week?',
  KITCHEN: 'What do we cook, by when, and what’s slipping?',
  DISPATCH: 'What must leave, with whom, and what is late?',
  DRIVER: 'Where do I go next?',
};

/** Each role lands here and sees its own figures (ACC-05). Definitions: PRD §8 / README. */
export default function DashboardPage() {
  const { data: me } = useMe();
  const zone = useMeta().data?.kitchenTimeZone ?? 'Asia/Kolkata';
  const { data, isPending, error, dataUpdatedAt } = useQuery({
    queryKey: ['dashboard'],
    queryFn: ({ signal }) => apiFetch<DashboardDto>('/dashboard', { signal }),
    refetchInterval: 60_000,
    enabled: hasPermission(me, 'dashboard.view'),
  });
  if (!me) return null;

  return (
    <>
      <PageHeader
        title={`Hello, ${me.user.name.split(' ')[0]}`}
        description={data ? `${QUESTION[data.kind]} ${formatDate(data.today, { weekday: 'long', day: 'numeric', month: 'long' })} · updated ${formatKitchen(new Date(dataUpdatedAt).toISOString(), zone)}` : undefined}
      />
      {isPending && <Skeleton className="h-96 w-full" />}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {data?.kind === 'ADMIN' && <AdminDashboard d={data} zone={zone} />}
      {data?.kind === 'KITCHEN' && <KitchenDashboard d={data} zone={zone} />}
      {data?.kind === 'DISPATCH' && <DispatchDashboard d={data} zone={zone} />}
      {data?.kind === 'DRIVER' && <DriverDashboard d={data} />}
    </>
  );
}

function AdminDashboard({ d, zone }: { d: AdminDashboardDto & { today: string }; zone: string }) {
  const t = (iso: string) => formatKitchen(iso, zone, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  const missing = d.A7.missingPrices.filter((m) => m.dishes + m.options > 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Today’s orders (A1)"
          value={d.A1.orders.toLocaleString('en-IN')}
          detail={`${d.A1.boxes.toLocaleString('en-IN')} boxes · ${formatCents(d.A1.bookedCents)} booked${d.A1.cancelledOrRejected ? ` · ${d.A1.cancelledOrRejected} cancelled/rejected` : ''}`}
          href="/orders"
        />
        <StatTile
          label="Kitchen progress (A2)"
          value={pct(d.A2.units)}
          detail={
            <>
              {d.A2.units.num} of {d.A2.units.den} prep units done
              {d.A2.lateUnits > 0 && <span className="font-medium text-status-late"> · {d.A2.lateUnits} late</span>}
            </>
          }
          tone={d.A2.lateUnits > 0 ? 'late' : undefined}
          href="/kitchen"
        />
        <StatTile
          label="Deliveries today (A3)"
          value={`${d.A3.delivered.num}/${d.A3.delivered.den}`}
          detail={`drops delivered · on time ${pct(d.A3.onTime)}`}
          href="/dispatch"
        />
        <StatTile
          label="Next cut-off (A4)"
          value={d.A4 ? formatDate(d.A4.date, { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}
          detail={d.A4 ? `closes ${t(d.A4.cutoffAt)} · ${d.A4.placed} placed (${formatCents(d.A4.placedCents)}) · ${d.A4.drafts} drafts will be cancelled` : 'No open date in the next 3 weeks'}
          tone={d.A4 && d.A4.drafts > 0 ? 'risk' : undefined}
          href="/settings/cutoffs"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Booked value, last 14 days (A5)" subtitle="Committed orders by delivery date, at captured prices. Cancelled and rejected excluded.">
          <BookedChart days={d.A5} today={d.today} />
        </Panel>
        <Panel title="Receivables (A6)" subtitle="Unbilled = committed orders not on an invoice + pending adjustments." action={<Link href="/billing" className="text-xs text-primary hover:underline">Billing</Link>}>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Unbilled</p>
              <p className="text-xl font-semibold">{formatCents(d.A6.unbilledCents)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Invoiced, unpaid</p>
              <p className="text-xl font-semibold">{formatCents(d.A6.outstandingCents)}</p>
              <p className="text-xs text-muted-foreground">
                {d.A6.outstandingInvoices} invoices{d.A6.oldestOutstanding ? ` · oldest ${formatDate(d.A6.oldestOutstanding)}` : ''}
              </p>
            </div>
          </div>
          <ul className="space-y-1 text-sm">
            {d.A6.topUnbilled.map((c) => (
              <li key={c.companyId} className="flex justify-between gap-2">
                <Link href={`/billing/companies/${c.companyId}`} className="truncate hover:underline">
                  {c.name}
                </Link>
                <span className="tabular-nums">{formatCents(c.cents)}</span>
              </li>
            ))}
            {d.A6.topUnbilled.length === 0 && <li className="text-muted-foreground">Everything is invoiced.</li>}
          </ul>
        </Panel>
      </div>
      <Panel title="Catalogue & setup health (A7)" subtitle="Dishes without a price on a tier silently disappear from those companies’ menus.">
        <div className="grid gap-4 md:grid-cols-3 text-sm">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Missing prices</p>
            {missing.length === 0 && <p className="text-status-ok">Every tier prices every active item.</p>}
            {missing.map((m) => (
              <Link key={m.tierId} href={`/pricing/${m.tierId}?missing=1`} className="flex items-center gap-1.5 hover:underline">
                <AlertTriangle className="size-3.5 text-status-late" aria-hidden /> {m.tier}: {m.dishes} dishes, {m.options} options
              </Link>
            ))}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Companies without an owner</p>
            {d.A7.companiesWithoutOwner.length === 0 ? <p className="text-status-ok">None.</p> : d.A7.companiesWithoutOwner.map((c) => <Link key={c.id} href={`/companies/${c.id}`} className="block hover:underline">{c.name}</Link>)}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Companies without a default driver</p>
            {d.A7.companiesWithoutDriver.length === 0 ? <p className="text-status-ok">None.</p> : d.A7.companiesWithoutDriver.map((c) => <Link key={c.id} href={`/companies/${c.id}`} className="block hover:underline">{c.name}</Link>)}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function KitchenDashboard({ d, zone }: { d: KitchenDashboardDto; zone: string }) {
  const total = d.K1.reduce((s, r) => ({ units: s.units + r.units, done: s.done + r.done }), { units: 0, done: 0 });
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Prep units done" value={`${total.done}/${total.units}`} detail="today’s committed orders" href="/kitchen" />
        <StatTile label="Late now (K3)" value={d.K3.late} detail={`${d.K3.lateBoxes} boxes past their kitchen-ready time`} tone={d.K3.late ? 'late' : 'ok'} href="/kitchen?show=late" />
        <StatTile label="At risk (K3)" value={d.K3.atRisk} detail={`${d.K3.atRiskBoxes} boxes due within the at-risk window`} href="/kitchen?show=risk" />
        <StatTile label="Allergy conflicts (K5)" value={d.K5.conflicts} detail="units containing an allergen the employee declared (should be 0)" tone={d.K5.conflicts ? 'late' : 'ok'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Workload by station (K1)" action={<Link href="/kitchen" className="text-xs text-primary hover:underline">Board</Link>}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Station</TableHead>
                <TableHead className="text-right">Boxes</TableHead>
                <TableHead className="text-right">To start</TableHead>
                <TableHead className="text-right">Cooking</TableHead>
                <TableHead className="w-28">Done</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.K1.map((r) => (
                <TableRow key={r.station}>
                  <TableCell className="font-medium">{r.station}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.boxes}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.notStarted}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.inProgress}</TableCell>
                  <TableCell>
                    <Meter ratio={{ num: r.done, den: r.units, pct: null }} label={`${r.station} done`} />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {r.done}/{r.units}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {d.K1.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    No confirmed orders today.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Panel>
        <Panel title="Next deadlines (K2)" subtitle="Not-done units by planned kitchen-ready time.">
          <ul className="space-y-1.5 text-sm">
            {d.K2.map((s) => (
              <li key={s.readyBy} className="flex justify-between">
                <span className="font-medium tabular-nums">Ready by {formatKitchen(s.readyBy, zone)}</span>
                <span className="text-muted-foreground tabular-nums">
                  {s.units} units · {s.boxes} boxes
                </span>
              </li>
            ))}
            {d.K2.length === 0 && <li className="text-status-ok">Nothing left to cook today.</li>}
          </ul>
        </Panel>
        <Panel title="Production summary (K4)" action={<Link href="/kitchen/summary" className="text-xs text-primary hover:underline">Full cook list</Link>}>
          <ul className="space-y-1 text-sm">
            {d.K4.map((p) => (
              <li key={p.dish} className="flex justify-between gap-2">
                <span className="min-w-0 truncate">
                  {p.dish} <span className="text-xs text-muted-foreground">· {p.station}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {p.doneBoxes}/{p.boxes}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={`Tomorrow, ${formatDate(d.K6.date)} (K6)`} subtitle={d.K6.provisional ? `Provisional: the cut-off hasn’t passed. ${d.K6.placedOrders} orders placed so far are not yet committed.` : 'Confirmed orders.'}>
          <ul className="space-y-1 text-sm">
            {d.K6.stations.map((s) => (
              <li key={s.station} className="flex justify-between">
                <span>{s.station}</span>
                <span className="tabular-nums">
                  {s.units} units · {s.boxes} boxes
                </span>
              </li>
            ))}
            {d.K6.stations.length === 0 && <li className="text-muted-foreground">No confirmed orders yet.</li>}
          </ul>
          <p className="mt-3 mb-1 text-xs font-medium text-muted-foreground">Allergens today (K5)</p>
          <p className="text-sm">{d.K5.allergens.map((a) => `${a.name} ${a.units}`).join(' · ') || '—'}</p>
        </Panel>
      </div>
    </div>
  );
}

function DispatchDashboard({ d, zone }: { d: DispatchDashboardDto; zone: string }) {
  const stages = [
    ['Waiting for kitchen', d.D1.waitingForKitchen],
    ['Ready to dispatch', d.D1.readyToDispatch],
    ['Dispatch-ready', d.D1.dispatchReady],
    ['Out for delivery', d.D1.outForDelivery],
    ['Delivered', d.D1.delivered],
  ] as const;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stages.map(([label, n]) => (
          <StatTile key={label} label={label} value={n} href="/dispatch" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="No driver (D2)" value={d.D2.count} detail={d.D2.drops.slice(0, 3).map((x) => `${x.time} ${x.company}`).join(' · ') || 'Every drop has a driver'} tone={d.D2.count ? 'late' : 'ok'} href="/dispatch" />
        <StatTile label="Late / at risk (D3)" value={`${d.D3.late} / ${d.D3.atRisk}`} detail="not yet left, past or near their leave-kitchen time" tone={d.D3.late ? 'late' : undefined} href="/dispatch" />
        <StatTile label="Delivered late today (D3)" value={d.D3.deliveredLate} detail="recorded once at delivery" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Driver load today (D4)">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead className="text-right">Drops</TableHead>
                <TableHead className="text-right">Left</TableHead>
                <TableHead className="text-right">Boxes</TableHead>
                <TableHead>Next leaves</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.D4.map((r) => (
                <TableRow key={r.driver}>
                  <TableCell className={r.driver === 'Unassigned' ? 'text-status-late' : 'font-medium'}>{r.driver}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.drops}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.remaining}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.boxes}</TableCell>
                  <TableCell className="tabular-nums">{r.nextDeparture ? formatKitchen(r.nextDeparture, zone) : '—'}</TableCell>
                </TableRow>
              ))}
              {d.D4.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    No drops today.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Panel>
        <Panel title="On-time rate, last 7 days (D5)" subtitle="On-time delivered drops ÷ delivered drops, by delivery date.">
          <Table>
            <TableBody>
              {d.D5.map((r) => (
                <TableRow key={r.date}>
                  <TableCell>{formatDate(r.date)}</TableCell>
                  <TableCell className="w-40">
                    {r.onTime.den > 0 && <Meter ratio={r.onTime} label={`On time ${formatDate(r.date)}`} />}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{pct(r.onTime)}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                    {r.onTime.num}/{r.onTime.den}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </div>
    </div>
  );
}

function DriverDashboard({ d }: { d: DriverDashboardDto }) {
  const n = d.R1.next;
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Today" value={d.R1.total} detail="drops" />
        <StatTile label="Left" value={d.R1.remaining} />
        <StatTile label="On time (R2)" value={pct(d.R2.onTime)} detail={`${d.R2.onTime.num}/${d.R2.onTime.den} delivered`} />
      </div>
      {n ? (
        <section className="rounded-xl border border-primary bg-card p-4 ring-1 ring-primary" aria-label="Next drop">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Next</p>
          <p className="text-2xl font-semibold tabular-nums">{n.time}</p>
          <p className="font-medium">{n.company}</p>
          <p className="mt-1 flex items-start gap-1.5 text-sm">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> {n.address}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm">
            <Package className="size-4 text-muted-foreground" aria-hidden /> {n.boxes} boxes
          </p>
          {n.instructions && <p className="mt-2 rounded-lg bg-muted px-2.5 py-2 text-sm">{n.instructions}</p>}
          <Button asChild className="mt-3 h-12 w-full text-base">
            <Link href="/driver">
              Open my deliveries <ArrowRight className="size-5" />
            </Link>
          </Button>
        </section>
      ) : (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{d.R1.total ? 'All done for today.' : 'No deliveries assigned to you today.'}</p>
      )}
    </div>
  );
}
