'use client';

import type { EmployeeDetailDto } from '@fernleaf/shared';
import { ArrowLeft, ArrowRightLeft, Crown, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import { ChipPicker } from '@/components/chip-picker';
import { Forbidden } from '@/components/forbidden';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useCompanies, useEmployee, useMoveEmployee, useSaveEmployee } from '@/features/admin/api';
import { errorText, useReference } from '@/features/catalogue/api';
import { ApiError } from '@/lib/api-client';
import { hasPermission, useMe } from '@/lib/auth';
import { formatDate, formatOrderNumber } from '@/lib/format';

function EmployeePage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const { data: me } = useMe();
  const { data: employee, isPending, error } = useEmployee(isNew ? null : id);
  const [moving, setMoving] = useState(false);
  if (me && !hasPermission(me, 'employees.read')) return <Forbidden />;
  if (!isNew && isPending) return <Skeleton className="h-96 w-full" />;
  if (!isNew && (error || !employee)) return <p className="text-sm text-destructive">{error?.message ?? 'Employee not found'}</p>;
  const canManage = hasPermission(me, 'employees.manage');

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link href="/employees">
          <ArrowLeft className="size-4" /> Employees
        </Link>
      </Button>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {isNew ? 'New employee' : employee!.name}
            {employee?.isOwner && <Crown className="size-5 text-amber-500" aria-label="Company owner" />}
          </h1>
          {employee && (
            <p className="text-sm text-muted-foreground">
              <Link href={`/companies/${employee.companyId}`} className="hover:underline">
                {employee.companyName}
              </Link>{' '}
              · {employee.orderCount} orders
            </p>
          )}
        </div>
        {employee && canManage && (
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/orders/new?employeeId=${employee.id}`}>New order</Link>
            </Button>
            <Button variant="outline" onClick={() => setMoving(true)}>
              <ArrowRightLeft className="size-4" /> Move to another company
            </Button>
          </div>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <EmployeeForm key={employee?.id ?? 'new'} employee={employee ?? null} canManage={canManage} />
        {employee && (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">Open orders</CardTitle>
              <CardDescription>Drafts and placed orders. After a move they stay with the old company and can only be cancelled.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {employee.openOrders.length === 0 && <p className="text-muted-foreground">None.</p>}
              {employee.openOrders.map((o) => (
                <Link key={o.id} href={`/orders/${o.id}`} className="flex justify-between gap-2 rounded px-1 py-0.5 hover:bg-accent">
                  <span className="font-medium">{formatOrderNumber(o.number)}</span>
                  <span className="text-muted-foreground">
                    {formatDate(o.deliveryDate)} · {o.status.toLowerCase()}
                    {o.companyName !== employee.companyName ? ` · ${o.companyName}` : ''}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
      {moving && employee && <MoveDialog employee={employee} onClose={() => setMoving(false)} />}
    </>
  );
}

function EmployeeForm({ employee, canManage }: { employee: EmployeeDetailDto | null; canManage: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const companies = useCompanies().data ?? [];
  const allergens = useReference('allergens').data ?? [];
  const tags = useReference('dietary-tags').data ?? [];
  const save = useSaveEmployee();
  const [f, setF] = useState({
    companyId: employee?.companyId ?? params.get('companyId') ?? '',
    name: employee?.name ?? '',
    email: employee?.email ?? '',
    phone: employee?.phone ?? '',
    canChooseAddress: employee?.canChooseAddress ?? false,
    canChangeDeliveryTime: employee?.canChangeDeliveryTime ?? false,
    canChangePackaging: employee?.canChangePackaging ?? false,
    allergenIds: employee?.allergenIds ?? [],
    dietaryTagIds: employee?.dietaryTagIds ?? [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const domains = companies.find((c) => c.id === f.companyId)?.domains ?? [];

  const submit = async () => {
    setErrors({});
    try {
      const saved = await save.mutateAsync({ id: employee?.id, body: { ...f, phone: f.phone.trim() || null } });
      toast.success(employee ? 'Employee saved' : 'Employee created');
      if (!employee) router.replace(`/employees/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.issues.length) setErrors(Object.fromEntries(err.issues.map((i) => [String(i.path[0]), i.message])));
      else toast.error(errorText(err));
    }
  };
  const err = (k: string) => errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>;

  return (
    <Card>
      <CardContent className="pt-6">
        <fieldset disabled={!canManage} className="space-y-4">
          {!employee && (
            <div className="space-y-1.5">
              <Label htmlFor="e-company">Company</Label>
              <Select value={f.companyId} onValueChange={(v) => set('companyId', v)}>
                <SelectTrigger id="e-company" className="w-full">
                  <SelectValue placeholder="Choose a company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="e-name">Name</Label>
              <Input id="e-name" value={f.name} onChange={(e) => set('name', e.target.value)} />
              {err('name')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-phone">Phone</Label>
              <Input id="e-phone" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-email">Email</Label>
            <Input id="e-email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder={domains[0] ? `name@${domains[0]}` : ''} />
            {domains.length > 0 && <p className="text-xs text-muted-foreground">Must end in {domains.map((d) => `@${d}`).join(' or ')}.</p>}
            {err('email')}
          </div>
          <div className="space-y-2">
            <Label>When ordering, this employee may…</Label>
            <Label className="flex items-center gap-2 font-normal">
              <Switch checked={f.canChooseAddress} onCheckedChange={(v) => set('canChooseAddress', v)} /> choose among the company’s delivery addresses
            </Label>
            <Label className="flex items-center gap-2 font-normal">
              <Switch checked={f.canChangeDeliveryTime} onCheckedChange={(v) => set('canChangeDeliveryTime', v)} /> change the delivery time
            </Label>
            <Label className="flex items-center gap-2 font-normal">
              <Switch checked={f.canChangePackaging} onCheckedChange={(v) => set('canChangePackaging', v)} /> change the packaging
            </Label>
          </div>
          <div className="space-y-1.5">
            <Label>Allergies</Label>
            <ChipPicker label="Allergies" items={allergens} value={f.allergenIds} onChange={(v) => set('allergenIds', v)} />
            <p className="text-xs text-muted-foreground">Shown as a warning when ordering and flagged on the kitchen board.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Dietary preferences</Label>
            <ChipPicker label="Dietary preferences" items={tags} value={f.dietaryTagIds} onChange={(v) => set('dietaryTagIds', v)} />
          </div>
          {canManage && (
            <Button onClick={submit} disabled={save.isPending || !f.companyId}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />} {employee ? 'Save' : 'Create employee'}
            </Button>
          )}
        </fieldset>
      </CardContent>
    </Card>
  );
}

function MoveDialog({ employee, onClose }: { employee: EmployeeDetailDto; onClose: () => void }) {
  const companies = (useCompanies().data ?? []).filter((c) => c.id !== employee.companyId);
  const move = useMoveEmployee(employee.id);
  const [companyId, setCompanyId] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const target = companies.find((c) => c.id === companyId);
  const submit = async () => {
    setError(null);
    try {
      await move.mutateAsync({ companyId, email });
      toast.success(`${employee.name} now works for ${target?.name}`);
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {employee.name}</DialogTitle>
          <DialogDescription>
            New orders will be priced and billed for the new company. Past orders stay with {employee.companyName}
            {employee.openOrders.length ? `; their ${employee.openOrders.length} open orders can then only be cancelled` : ''}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="m-company">New company</Label>
            <Select
              value={companyId}
              onValueChange={(v) => {
                setCompanyId(v);
                const d = companies.find((c) => c.id === v)?.domains[0];
                if (d) setEmail(`${employee.email.split('@')[0]}@${d}`);
              }}
            >
              <SelectTrigger id="m-company" className="w-full">
                <SelectValue placeholder="Choose a company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-email">New email</Label>
            <Input id="m-email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {target && <p className="text-xs text-muted-foreground">Must end in {target.domains.map((d) => `@${d}`).join(' or ')}.</p>}
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
          <Button onClick={submit} disabled={!companyId || !email.trim() || move.isPending}>
            {move.isPending && <Loader2 className="size-4 animate-spin" />} Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EmployeeDetailPage() {
  return (
    <Suspense>
      <EmployeePage />
    </Suspense>
  );
}
