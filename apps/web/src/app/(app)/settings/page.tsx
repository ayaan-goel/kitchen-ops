'use client';

import { type SettingsDto, WEEKDAY_LABELS } from '@fernleaf/shared';
import { Loader2, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Forbidden } from '@/components/forbidden';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useSettings, useSettingsWrite } from '@/features/admin/api';
import { errorText } from '@/features/catalogue/api';
import { ApiError } from '@/lib/api-client';
import { hasPermission, useMe } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { formatKitchen, useMeta } from '@/lib/kitchen-time';

/** Platform settings (SET-01, SET-02). The kitchen time zone is fixed and shown for reference. */
export default function SettingsPage() {
  const { data: me } = useMe();
  const { data, isPending, error } = useSettings();
  if (me && !hasPermission(me, 'settings.read')) return <Forbidden />;
  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (error || !data) return <p className="text-sm text-destructive">{error?.message}</p>;
  return <SettingsForm key={data.updatedAt} settings={data} canManage={hasPermission(me, 'settings.manage')} />;
}

function SettingsForm({ settings, canManage }: { settings: SettingsDto; canManage: boolean }) {
  const write = useSettingsWrite();
  const meta = useMeta().data;
  const [f, setF] = useState({
    kitchenWorkingDays: settings.kitchenWorkingDays,
    cutoffTime: settings.cutoffTime,
    cutoffDaysBefore: String(settings.cutoffDaysBefore),
    kitchenBufferMinutes: String(settings.kitchenBufferMinutes),
    atRiskMinutes: String(settings.atRiskMinutes),
    onTimeGraceMinutes: String(settings.onTimeGraceMinutes),
    deliveryWindowStart: settings.deliveryWindowStart,
    deliveryWindowEnd: settings.deliveryWindowEnd,
    publicEmailDomains: settings.publicEmailDomains.join('\n'),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [holiday, setHoliday] = useState({ date: '', name: '' });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const num = (k: 'cutoffDaysBefore' | 'kitchenBufferMinutes' | 'atRiskMinutes' | 'onTimeGraceMinutes', label: string, hint: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`s-${k}`}>{label}</Label>
      <Input id={`s-${k}`} inputMode="numeric" value={f[k]} onChange={(e) => set(k, e.target.value.replace(/\D/g, ''))} />
      <p className="text-xs text-muted-foreground">{hint}</p>
      {errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>}
    </div>
  );

  const save = () => {
    setErrors({});
    write.mutate(
      {
        path: '',
        method: 'PUT',
        body: {
          ...f,
          cutoffDaysBefore: Number(f.cutoffDaysBefore || 0),
          kitchenBufferMinutes: Number(f.kitchenBufferMinutes || 0),
          atRiskMinutes: Number(f.atRiskMinutes || 0),
          onTimeGraceMinutes: Number(f.onTimeGraceMinutes || 0),
          publicEmailDomains: f.publicEmailDomains.split(/[\s,]+/).map((d) => d.trim()).filter(Boolean),
        },
      },
      {
        onSuccess: () => toast.success('Settings saved. The cut-off schedule is recalculated for dates not yet processed.'),
        onError: (err) => {
          if (err instanceof ApiError && err.issues.length) setErrors(Object.fromEntries(err.issues.map((i) => [String(i.path[0]), i.message])));
          else toast.error(errorText(err));
        },
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Settings"
        description={`Kitchen time zone: ${settings.kitchenTimeZone} (fixed). Last saved ${formatKitchen(settings.updatedAt, settings.kitchenTimeZone, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}${settings.updatedBy ? ` by ${settings.updatedBy}` : ''}.`}
      />
      <fieldset disabled={!canManage} className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kitchen calendar & cut-off</CardTitle>
            <CardDescription>
              Orders for a date lock at the cut-off: {f.cutoffDaysBefore || '?'} kitchen working days before, at {f.cutoffTime} IST. Processed dates stay locked. See the{' '}
              <Link href="/settings/cutoffs" className="text-primary hover:underline">
                cut-off console
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Kitchen working days</Label>
              <div className="flex flex-wrap gap-3">
                {WEEKDAY_LABELS.map((d, i) => (
                  <Label key={d} className="flex items-center gap-1.5 font-normal">
                    <Checkbox
                      checked={f.kitchenWorkingDays.includes(i + 1)}
                      onCheckedChange={(v) => set('kitchenWorkingDays', v === true ? [...f.kitchenWorkingDays, i + 1].sort() : f.kitchenWorkingDays.filter((x) => x !== i + 1))}
                    />
                    {d}
                  </Label>
                ))}
              </div>
              {errors.kitchenWorkingDays && <p className="text-xs text-destructive">{errors.kitchenWorkingDays}</p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="s-cut">Cut-off time (IST)</Label>
                <Input id="s-cut" type="time" value={f.cutoffTime} onChange={(e) => set('cutoffTime', e.target.value)} />
              </div>
              {num('cutoffDaysBefore', 'Working days before', '2 = two kitchen working days before delivery')}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Timing</CardTitle>
            <CardDescription>Drive the planned kitchen-ready and dispatch-ready times, risk flags and on-time.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="s-ws">Deliveries from</Label>
                <Input id="s-ws" type="time" value={f.deliveryWindowStart} onChange={(e) => set('deliveryWindowStart', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-we">until</Label>
                <Input id="s-we" type="time" value={f.deliveryWindowEnd} onChange={(e) => set('deliveryWindowEnd', e.target.value)} />
                {errors.deliveryWindowEnd && <p className="text-xs text-destructive">{errors.deliveryWindowEnd}</p>}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {num('kitchenBufferMinutes', 'Kitchen buffer (min)', 'kitchen-ready this long before dispatch-ready')}
              {num('atRiskMinutes', 'At-risk window (min)', 'flag work this close to its deadline')}
              {num('onTimeGraceMinutes', 'On-time grace (min)', 'delivered this late still counts as on time')}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Public email domains</CardTitle>
            <CardDescription>These can never be a company domain. One per line.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea value={f.publicEmailDomains} onChange={(e) => set('publicEmailDomains', e.target.value)} rows={8} className="font-mono text-sm" aria-label="Public email domains" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kitchen holidays</CardTitle>
            <CardDescription>The kitchen is closed; no deliveries, and cut-offs count around these days.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {settings.holidays.filter((h) => h.date >= (meta?.today ?? '')).length === 0 && <p className="text-sm text-muted-foreground">No upcoming holidays.</p>}
            {settings.holidays
              .filter((h) => h.date >= (meta?.today ?? ''))
              .map((h) => (
                <div key={h.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
                  <span>
                    {formatDate(h.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · {h.name}
                  </span>
                  {canManage && (
                    <Button size="icon" variant="ghost" className="size-7" aria-label={`Remove ${h.name}`} onClick={() => write.mutate({ path: `/kitchen-holidays/${h.id}`, method: 'DELETE' }, { onError: (e) => toast.error(errorText(e)) })}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            {canManage && (
              <form
                className="flex flex-wrap gap-2 pt-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  write.mutate(
                    { path: '/kitchen-holidays', method: 'POST', body: holiday },
                    { onSuccess: () => (setHoliday({ date: '', name: '' }), toast.success('Kitchen holiday added')), onError: (err) => toast.error(errorText(err)) },
                  );
                }}
              >
                <Input type="date" min={meta?.today} value={holiday.date} onChange={(e) => setHoliday((h) => ({ ...h, date: e.target.value }))} className="w-auto" aria-label="Holiday date" />
                <Input value={holiday.name} onChange={(e) => setHoliday((h) => ({ ...h, name: e.target.value }))} placeholder="e.g. Diwali" className="flex-1" aria-label="Holiday name" />
                <Button type="submit" disabled={!holiday.date || !holiday.name.trim()}>
                  Add
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        {canManage && (
          <div className="lg:col-span-2">
            <Button onClick={save} disabled={write.isPending}>
              {write.isPending && <Loader2 className="size-4 animate-spin" />} Save settings
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">Default price tier: {settings.defaultPriceTier.name} (change it on the Pricing page).</p>
          </div>
        )}
      </fieldset>
    </>
  );
}
