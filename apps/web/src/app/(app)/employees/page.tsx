'use client';

import { ChevronLeft, ChevronRight, Crown, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Forbidden } from '@/components/forbidden';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompanies, useEmployees } from '@/features/admin/api';
import { hasPermission, useMe } from '@/lib/auth';

const ALL = '__all';

function EmployeeList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: me } = useMe();
  const companies = useCompanies().data ?? [];
  const [q, setQ] = useState(params.get('q') ?? '');
  const { data, isPending, error } = useEmployees(params);
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value && value !== ALL) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    router.replace(`${pathname}?${next.toString()}`);
  };
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') !== q) setParam('q', q.trim() || null);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  if (me && !hasPermission(me, 'employees.read')) return <Forbidden />;
  const page = Number(params.get('page') ?? '1');
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const flag = (on: boolean, label: string) => on && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{label}</span>;

  return (
    <>
      <PageHeader
        title="Employees"
        description="People who order through their company. Each belongs to one company and uses one of its email domains."
        actions={
          hasPermission(me, 'employees.manage') ? (
            <Button asChild>
              <Link href={`/employees/new${params.get('companyId') ? `?companyId=${params.get('companyId')}` : ''}`}>
                <Plus className="size-4" /> New employee
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="relative">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email" className="pl-8" aria-label="Search employees" />
        </div>
        <Select value={params.get('companyId') ?? ALL} onValueChange={(v) => setParam('companyId', v)}>
          <SelectTrigger aria-label="Company" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All companies</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Email</TableHead>
              <TableHead>Company</TableHead>
              <TableHead className="hidden lg:table-cell">May choose</TableHead>
              <TableHead className="hidden lg:table-cell text-right">Allergies</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton className="h-32 w-full" />
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-destructive">
                  {error.message}
                </TableCell>
              </TableRow>
            )}
            {data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  No employees match.
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((e) => (
              <TableRow key={e.id} className="cursor-pointer" onClick={() => router.push(`/employees/${e.id}`)}>
                <TableCell className="font-medium">
                  <Link href={`/employees/${e.id}`} className="inline-flex items-center gap-1 hover:underline" onClick={(ev) => ev.stopPropagation()}>
                    {e.name}
                    {e.isOwner && <Crown className="size-3.5 text-amber-500" aria-label="Company owner" />}
                  </Link>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{e.email}</TableCell>
                <TableCell className="text-sm">{e.company.name}</TableCell>
                <TableCell className="hidden lg:table-cell">
                  <span className="flex flex-wrap gap-1">
                    {flag(e.flags.address, 'address')}
                    {flag(e.flags.time, 'time')}
                    {flag(e.flags.packaging, 'packaging')}
                  </span>
                </TableCell>
                <TableCell className="hidden text-right tabular-nums lg:table-cell">{e.allergies || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>{data ? `${data.total} employees` : ' '}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}>
            <ChevronLeft className="size-4" /> Prev
          </Button>
          <span className="tabular-nums">
            {page} / {pageCount}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setParam('page', String(page + 1))}>
            Next <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </>
  );
}

export default function EmployeesPage() {
  return (
    <Suspense>
      <EmployeeList />
    </Suspense>
  );
}
