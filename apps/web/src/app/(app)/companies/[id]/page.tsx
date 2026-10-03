'use client';

import { type CompanyDetailDto, WEEKDAY_LABELS } from '@fernleaf/shared';
import { ArrowLeft, Download, Loader2, Plus, Star, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Forbidden } from '@/components/forbidden';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useCompany, useCompanyWrite, useDriversList, useEmployees, useImportEmployees } from '@/features/admin/api';
import { errorText, useMenuAdmin, useReference, useTiers } from '@/features/catalogue/api';
import { ApiError } from '@/lib/api-client';
import { hasPermission, useMe } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { useMeta } from '@/lib/kitchen-time';

const TABS = [
  ['profile', 'Profile & delivery'],
  ['places', 'Domains & addresses'],
  ['calendar', 'Calendar'],
  ['menu', 'Menu visibility'],
  ['import', 'Import employees'],
] as const;
const NONE = '__none';

function CompanyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: me } = useMe();
  const { data: company, isPending, error } = useCompany(id);
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab')! : 'profile';
  if (me && !hasPermission(me, 'companies.read')) return <Forbidden />;
  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (error || !company) return <p className="text-sm text-destructive">{error?.message ?? 'Company not found'}</p>;
  const canManage = hasPermission(me, 'companies.manage');

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link href="/companies">
          <ArrowLeft className="size-4" /> Companies
        </Link>
      </Button>
      <h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        {company.employees} employees ·{' '}
        <Link href={`/employees?companyId=${company.id}`} className="text-primary hover:underline">
          view employees
        </Link>{' '}
        ·{' '}
        <Link href={`/billing/companies/${company.id}`} className="text-primary hover:underline">
          billing
        </Link>
      </p>
      <Tabs value={tab} onValueChange={(t) => router.replace(`${pathname}?tab=${t}`)} className="mb-4">
        <TabsList className="h-auto flex-wrap">
          {TABS.map(([k, label]) => (
            <TabsTrigger key={k} value={k}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {tab === 'profile' && <ProfileForm key={company.id} company={company} canManage={canManage} />}
      {tab === 'places' && <Places company={company} canManage={canManage} />}
      {tab === 'calendar' && <Calendar company={company} canManage={canManage} />}
      {tab === 'menu' && <Visibility key={JSON.stringify([company.hiddenCategoryIds, company.hiddenMenuItemIds])} company={company} canManage={canManage} />}
      {tab === 'import' && <Import company={company} canManage={hasPermission(me, 'employees.manage')} />}
    </>
  );
}

function ProfileForm({ company, canManage }: { company: CompanyDetailDto; canManage: boolean }) {
  const write = useCompanyWrite(company.id);
  const tiers = useTiers().data ?? [];
  const packaging = useReference('packaging-types').data ?? [];
  const drivers = useDriversList().data ?? [];
  const firstPage = useEmployees(new URLSearchParams({ companyId: company.id, pageSize: '100' })).data?.items ?? [];
  // Keep the current owner selectable even if they aren't in the first 100 names.
  const employees =
    company.ownerEmployeeId && !firstPage.some((e) => e.id === company.ownerEmployeeId)
      ? [{ id: company.ownerEmployeeId, name: company.ownerName ?? 'Current owner', email: '' }, ...firstPage]
      : firstPage;
  const [f, setF] = useState({
    name: company.name,
    billingContactName: company.billingContactName,
    billingEmail: company.billingEmail,
    billingPhone: company.billingPhone ?? '',
    billingAddress: company.billingAddress,
    priceTierId: company.priceTierId ?? NONE,
    ownerEmployeeId: company.ownerEmployeeId ?? NONE,
    workingDays: company.workingDays,
    defaultDeliveryTime: company.defaultDeliveryTime,
    dispatchLeadMinutes: String(company.dispatchLeadMinutes),
    defaultPackagingTypeId: company.defaultPackagingTypeId,
    driverInstructions: company.driverInstructions,
    defaultDriverId: company.defaultDriverId ?? NONE,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const nul = (v: string) => (v === NONE ? null : v);

  const submit = () => {
    setErrors({});
    write.mutate(
      {
        path: '',
        method: 'PUT',
        body: {
          ...f,
          billingPhone: f.billingPhone.trim() || null,
          priceTierId: nul(f.priceTierId),
          ownerEmployeeId: nul(f.ownerEmployeeId),
          defaultDriverId: nul(f.defaultDriverId),
          dispatchLeadMinutes: Number(f.dispatchLeadMinutes || 0),
        },
      },
      {
        onSuccess: () => toast.success('Company saved'),
        onError: (err) => {
          if (err instanceof ApiError && err.issues.length) setErrors(Object.fromEntries(err.issues.map((i) => [String(i.path[0]), i.message])));
          else toast.error(errorText(err));
        },
      },
    );
  };
  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;
  const text = (k: 'name' | 'billingContactName' | 'billingEmail' | 'billingPhone', label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`c-${k}`}>{label}</Label>
      <Input id={`c-${k}`} value={f[k]} onChange={(e) => set(k, e.target.value)} />
      {err(k)}
    </div>
  );

  return (
    <fieldset disabled={!canManage} className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile & billing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {text('name', 'Company name')}
          <div className="grid gap-3 sm:grid-cols-2">
            {text('billingContactName', 'Billing contact')}
            {text('billingEmail', 'Billing email')}
          </div>
          {text('billingPhone', 'Billing phone')}
          <div className="space-y-1.5">
            <Label htmlFor="c-baddr">Billing address</Label>
            <Textarea id="c-baddr" value={f.billingAddress} onChange={(e) => set('billingAddress', e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-tier">Price tier</Label>
            <Select value={f.priceTierId} onValueChange={(v) => set('priceTierId', v)}>
              <SelectTrigger id="c-tier" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Default tier ({tiers.find((t) => t.isDefault)?.name ?? '…'})</SelectItem>
                {tiers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Changes apply to new orders; placed orders keep their prices.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-owner">Owner (one of its employees)</Label>
            <Select value={f.ownerEmployeeId} onValueChange={(v) => set('ownerEmployeeId', v)}>
              <SelectTrigger id="c-owner" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not set</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name} · {e.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {err('ownerEmployeeId')}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery defaults</CardTitle>
          <CardDescription>Used when an employee isn’t allowed to choose (per-employee flags).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Working days (deliveries accepted)</Label>
            <div className="flex flex-wrap gap-3">
              {WEEKDAY_LABELS.map((d, i) => (
                <Label key={d} className="flex items-center gap-1.5 font-normal">
                  <Checkbox
                    checked={f.workingDays.includes(i + 1)}
                    onCheckedChange={(v) => set('workingDays', v === true ? [...f.workingDays, i + 1].sort() : f.workingDays.filter((x) => x !== i + 1))}
                  />
                  {d}
                </Label>
              ))}
            </div>
            {err('workingDays')}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-time">Default delivery time</Label>
              <Input id="c-time" type="time" step={900} value={f.defaultDeliveryTime} onChange={(e) => set('defaultDeliveryTime', e.target.value)} />
              {err('defaultDeliveryTime')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-lead">Leave kitchen (min before)</Label>
              <Input id="c-lead" inputMode="numeric" value={f.dispatchLeadMinutes} onChange={(e) => set('dispatchLeadMinutes', e.target.value.replace(/\D/g, ''))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-pack">Default packaging</Label>
            <Select value={f.defaultPackagingTypeId} onValueChange={(v) => set('defaultPackagingTypeId', v)}>
              <SelectTrigger id="c-pack" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {packaging
                  .filter((p) => p.isActive || p.id === f.defaultPackagingTypeId)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-driver">Default driver</Label>
            <Select value={f.defaultDriverId} onValueChange={(v) => set('defaultDriverId', v)}>
              <SelectTrigger id="c-driver" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None (dispatch assigns)</SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {err('defaultDriverId')}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-instr">Standing instructions for drivers</Label>
            <Textarea id="c-instr" value={f.driverInstructions} onChange={(e) => set('driverInstructions', e.target.value)} rows={2} />
          </div>
        </CardContent>
      </Card>
      {canManage && (
        <div className="lg:col-span-2">
          <Button onClick={submit} disabled={write.isPending}>
            {write.isPending && <Loader2 className="size-4 animate-spin" />} Save company
          </Button>
        </div>
      )}
    </fieldset>
  );
}

function Places({ company, canManage }: { company: CompanyDetailDto; canManage: boolean }) {
  const write = useCompanyWrite(company.id);
  const [domain, setDomain] = useState('');
  const [editing, setEditing] = useState<CompanyDetailDto['addresses'][number] | 'new' | null>(null);
  const run = (path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown, ok?: string, done?: () => void) =>
    write.mutate({ path, method, body }, { onSuccess: () => (ok && toast.success(ok), done?.()), onError: (err) => toast.error(errorText(err)) });

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email domains</CardTitle>
          <CardDescription>Employees’ emails must use one of these. Public providers (gmail.com…) are refused.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {company.domains.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
              <span>
                @{d.domain} <span className="text-xs text-muted-foreground">· {d.employees} employees</span>
              </span>
              {canManage && (
                <Button size="icon" variant="ghost" className="size-7" aria-label={`Remove ${d.domain}`} onClick={() => run(`/domains/${d.id}`, 'DELETE', undefined, 'Domain removed')}>
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
          {canManage && (
            <form
              className="flex gap-2 pt-1"
              onSubmit={(e) => {
                e.preventDefault();
                run('/domains', 'POST', { domain }, 'Domain added', () => setDomain(''));
              }}
            >
              <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.com" aria-label="New domain" />
              <Button type="submit" disabled={!domain.trim() || write.isPending}>
                Add
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Delivery addresses</CardTitle>
            <CardDescription>Exactly one default. Employees allowed to choose pick among the active ones.</CardDescription>
          </div>
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
              <Plus className="size-4" /> Address
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {company.addresses.map((a) => (
            <div key={a.id} className={`rounded-md border p-3 text-sm ${a.isActive ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{a.label}</span>
                {a.isDefault && (
                  <span className="inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-xs text-primary">
                    <Star className="size-3" aria-hidden /> Default
                  </span>
                )}
                {!a.isActive && <span className="text-xs">Inactive</span>}
                {canManage && (
                  <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => setEditing(a)}>
                    Edit
                  </Button>
                )}
              </div>
              <p className="text-muted-foreground">{[a.line1, a.line2, `${a.city} ${a.postalCode}`].filter(Boolean).join(', ')}</p>
              {a.deliveryNotes && <p className="text-xs">Notes: {a.deliveryNotes}</p>}
            </div>
          ))}
          {company.addresses.length === 0 && <p className="text-sm text-status-late">No address yet: employees can’t order until one is added.</p>}
          {editing && <AddressForm company={company} address={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
        </CardContent>
      </Card>
    </div>
  );
}

function AddressForm({ company, address, onDone }: { company: CompanyDetailDto; address: CompanyDetailDto['addresses'][number] | null; onDone: () => void }) {
  const write = useCompanyWrite(company.id);
  const [f, setF] = useState({
    label: address?.label ?? '',
    line1: address?.line1 ?? '',
    line2: address?.line2 ?? '',
    city: address?.city ?? 'Hyderabad',
    state: address?.state ?? 'Telangana',
    postalCode: address?.postalCode ?? '',
    deliveryNotes: address?.deliveryNotes ?? '',
    isActive: address?.isActive ?? true,
    makeDefault: address?.isDefault ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const input = (k: 'label' | 'line1' | 'line2' | 'city' | 'postalCode', label: string) => (
    <div className="space-y-1">
      <Label htmlFor={`a-${k}`}>{label}</Label>
      <Input id={`a-${k}`} value={f[k]} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} />
    </div>
  );
  const submit = () =>
    write.mutate(
      { path: address ? `/addresses/${address.id}` : '/addresses', method: address ? 'PUT' : 'POST', body: { ...f, line2: f.line2 || null, state: f.state || null } },
      { onSuccess: () => (toast.success('Address saved'), onDone()), onError: (err) => setError(errorText(err)) },
    );
  return (
    <div className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {input('label', 'Label (e.g. HQ – Tower B)')}
        {input('line1', 'Address line 1')}
        {input('line2', 'Address line 2')}
        <div className="grid grid-cols-2 gap-3">
          {input('city', 'City')}
          {input('postalCode', 'PIN code')}
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="a-notes">Delivery notes for drivers</Label>
        <Textarea id="a-notes" value={f.deliveryNotes} onChange={(e) => setF((p) => ({ ...p, deliveryNotes: e.target.value }))} rows={2} />
      </div>
      <div className="flex flex-wrap gap-6">
        {address && (
          <Label className="flex items-center gap-2 font-normal">
            <Switch checked={f.isActive} onCheckedChange={(v) => setF((p) => ({ ...p, isActive: v }))} /> Active
          </Label>
        )}
        <Label className="flex items-center gap-2 font-normal">
          <Switch checked={f.makeDefault} disabled={address?.isDefault} onCheckedChange={(v) => setF((p) => ({ ...p, makeDefault: v }))} /> Default address
        </Label>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={write.isPending}>
          Save address
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Calendar({ company, canManage }: { company: CompanyDetailDto; canManage: boolean }) {
  const write = useCompanyWrite(company.id);
  const today = useMeta().data?.today ?? '';
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const upcoming = company.holidays.filter((h) => h.date >= today);
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="text-base">Company holidays</CardTitle>
        <CardDescription>No deliveries on these dates (on top of non-working days). Working days are set on the Profile tab.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {upcoming.length === 0 && <p className="text-sm text-muted-foreground">No upcoming holidays.</p>}
        {upcoming.map((h) => (
          <div key={h.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
            <span>
              {formatDate(h.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · {h.name}
            </span>
            {canManage && (
              <Button size="icon" variant="ghost" className="size-7" aria-label={`Remove ${h.name}`} onClick={() => write.mutate({ path: `/holidays/${h.id}`, method: 'DELETE' }, { onError: (e) => toast.error(errorText(e)) })}>
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
                { path: '/holidays', method: 'POST', body: { date, name } },
                { onSuccess: () => (setDate(''), setName(''), toast.success('Holiday added')), onError: (err) => toast.error(errorText(err)) },
              );
            }}
          >
            <Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" aria-label="Holiday date" />
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Annual offsite" className="flex-1" aria-label="Holiday name" />
            <Button type="submit" disabled={!date || !name.trim() || write.isPending}>
              Add holiday
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function Visibility({ company, canManage }: { company: CompanyDetailDto; canManage: boolean }) {
  const write = useCompanyWrite(company.id);
  const menu = useMenuAdmin().data ?? [];
  const [cats, setCats] = useState(new Set(company.hiddenCategoryIds));
  const [items, setItems] = useState(new Set(company.hiddenMenuItemIds));
  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string, hidden: boolean) => {
    const next = new Set(set);
    if (hidden) next.add(id);
    else next.delete(id);
    setter(next);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">What {company.name} can see</CardTitle>
        <CardDescription>Untick to hide a whole category or single dishes from this company’s employees. Hidden beats secret: a hidden secret category can’t be reached by link either.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {menu.map((c) => (
          <div key={c.id}>
            <Label className="flex items-center gap-2 font-medium">
              <Checkbox checked={!cats.has(c.id)} disabled={!canManage} onCheckedChange={(v) => toggle(cats, setCats, c.id, v !== true)} />
              {c.name} {c.isSecret && <span className="text-xs font-normal text-muted-foreground">(secret)</span>}
            </Label>
            {!cats.has(c.id) && (
              <div className="mt-1 ml-6 flex flex-wrap gap-x-4 gap-y-1">
                {c.items.map((i) => (
                  <Label key={i.id} className="flex items-center gap-1.5 text-sm font-normal">
                    <Checkbox checked={!items.has(i.id)} disabled={!canManage} onCheckedChange={(v) => toggle(items, setItems, i.id, v !== true)} />
                    {i.dishName}
                  </Label>
                ))}
              </div>
            )}
          </div>
        ))}
        {canManage && (
          <Button
            onClick={() =>
              write.mutate(
                { path: '/menu-visibility', method: 'PUT', body: { hiddenCategoryIds: [...cats], hiddenMenuItemIds: [...items] } },
                { onSuccess: () => toast.success('Menu visibility saved'), onError: (err) => toast.error(errorText(err)) },
              )
            }
            disabled={write.isPending}
          >
            Save visibility
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

const SAMPLE = 'name,email,phone,allergies,dietary,can_choose_address,can_change_time,can_change_packaging\nPriya Nair,priya.nair@DOMAIN,+91 98480 12345,Peanuts;Dairy,Vegetarian,no,yes,no\n';

function Import({ company, canManage }: { company: CompanyDetailDto; canManage: boolean }) {
  const importer = useImportEmployees(company.id);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const report = importer.data;
  const sampleHref = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE.replace('DOMAIN', company.domains[0]?.domain ?? 'example.com'))}`;
  const run = (dryRun: boolean) => file && importer.mutate({ file, dryRun }, { onError: (err) => toast.error(errorText(err)), onSuccess: (r) => !r.dryRun && toast.success(`${r.created} employees created`) });

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="text-base">Import employees from CSV</CardTitle>
        <CardDescription>Check the file first; nothing is saved until you import. Invalid rows are skipped and listed. Allergies and dietary preferences are separated by “;”.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <a href={sampleHref} download={`${company.name.replace(/\W+/g, '-').toLowerCase()}-employees.csv`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <Download className="size-4" aria-hidden /> Download a sample CSV
        </a>
        <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="CSV file" />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => input.current?.click()} disabled={!canManage}>
            <Upload className="size-4" /> {file ? file.name : 'Choose CSV'}
          </Button>
          <Button variant="outline" disabled={!file || importer.isPending} onClick={() => run(true)}>
            Check file
          </Button>
          <Button disabled={!file || importer.isPending || !report?.dryRun || report.valid === 0} onClick={() => run(false)}>
            {importer.isPending && <Loader2 className="size-4 animate-spin" />} Import {report?.dryRun ? report.valid : ''} valid rows
          </Button>
        </div>
        {report && (
          <div className="space-y-2">
            <p className="text-sm">
              {report.total} rows · <span className="text-status-ok">{report.valid} valid</span> · <span className={report.invalid ? 'text-status-late' : ''}>{report.invalid} with problems</span>
              {!report.dryRun && <> · <strong>{report.created} created</strong></>}
            </p>
            {report.rows.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Problems</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((r) => (
                    <TableRow key={r.row}>
                      <TableCell className="tabular-nums">{r.row}</TableCell>
                      <TableCell>{r.email || '—'}</TableCell>
                      <TableCell className="text-sm text-status-late">{r.errors.map((e) => `${e.column}: ${e.message}`).join('; ')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CompanyDetailPage() {
  return (
    <Suspense>
      <CompanyPage />
    </Suspense>
  );
}
