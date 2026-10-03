'use client';

import { ChevronLeft, ChevronRight, Flame, Plus, Search, Snowflake } from 'lucide-react';
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
import { useDishes, useReference } from '@/features/catalogue/api';
import { hasPermission, useMe } from '@/lib/auth';
import { formatCents } from '@/lib/format';

const ALL = '__all';

function DishList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: me } = useMe();
  const stations = useReference('stations').data ?? [];
  const [q, setQ] = useState(params.get('q') ?? '');
  const { data, isPending, error } = useDishes(params);

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

  if (me && !hasPermission(me, 'catalogue.read')) return <Forbidden />;
  const page = Number(params.get('page') ?? '1');
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Dishes"
        description="The catalogue. Dishes are deactivated, never deleted, so past orders keep their history."
        actions={
          hasPermission(me, 'catalogue.manage') ? (
            <Button asChild>
              <Link href="/catalogue/dishes/new">
                <Plus className="size-4" /> New dish
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div className="relative sm:col-span-1 lg:col-span-2">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or SKU" className="pl-8" aria-label="Search dishes" />
        </div>
        <Select value={params.get('stationId') ?? ALL} onValueChange={(v) => setParam('stationId', v)}>
          <SelectTrigger aria-label="Station" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All stations</SelectItem>
            {stations.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
            <SelectItem value="none">Unassigned</SelectItem>
          </SelectContent>
        </Select>
        <Select value={params.get('active') ?? ALL} onValueChange={(v) => setParam('active', v)}>
          <SelectTrigger aria-label="Status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Active and inactive</SelectItem>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Dish</TableHead>
              <TableHead className="hidden md:table-cell">Station</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="hidden lg:table-cell text-right">Option groups</TableHead>
              <TableHead className="hidden lg:table-cell text-right">On menu</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Skeleton className="h-32 w-full" />
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
            {data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No dishes match.
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((d) => (
              <TableRow key={d.id} className={`cursor-pointer ${d.isActive ? '' : 'opacity-60'}`} onClick={() => router.push(`/catalogue/dishes/${d.id}`)}>
                <TableCell className="font-mono text-xs">{d.sku}</TableCell>
                <TableCell className="font-medium">
                  <Link href={`/catalogue/dishes/${d.id}`} className="flex items-center gap-1.5 hover:underline" onClick={(e) => e.stopPropagation()}>
                    {d.temperature === 'HOT' ? <Flame className="size-3.5 text-orange-500" aria-label="Hot" /> : <Snowflake className="size-3.5 text-sky-500" aria-label="Cold" />}
                    {d.name}
                  </Link>
                </TableCell>
                <TableCell className="hidden text-sm md:table-cell">{d.stationName ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCents(d.costCents)}</TableCell>
                <TableCell className="hidden text-right tabular-nums lg:table-cell">{d.groupCount}</TableCell>
                <TableCell className="hidden text-right tabular-nums lg:table-cell">{d.menuPlacements ? `${d.menuPlacements}×` : '—'}</TableCell>
                <TableCell className="text-sm">{d.isActive ? 'Active' : 'Inactive'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>{data ? `${data.total} dishes` : ' '}</span>
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

export default function DishesPage() {
  return (
    <Suspense>
      <DishList />
    </Suspense>
  );
}
