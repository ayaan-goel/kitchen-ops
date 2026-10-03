'use client';

import { ORDER_STATUSES, type OrderStatus } from '@fernleaf/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Forbidden } from '@/components/forbidden';
import { PageHeader } from '@/components/page-header';
import { OrderStatusBadge, ORDER_STATUS_LABELS } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOrders } from '@/features/orders/api';
import { apiFetch } from '@/lib/api-client';
import { hasPermission, useMe } from '@/lib/auth';
import { formatCents, formatDate, formatOrderNumber } from '@/lib/format';

const ALL = '__all';

function OrdersList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: me } = useMe();
  const [q, setQ] = useState(params.get('q') ?? '');
  const companies = useQuery({
    queryKey: ['lookups', 'companies'],
    queryFn: ({ signal }) => apiFetch<{ id: string; name: string }[]>('/lookups/companies', { signal }),
    staleTime: 5 * 60_000,
  });

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value && value !== ALL) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    router.replace(`${pathname}?${next.toString()}`);
  };

  // Debounced search box → URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') !== q) setParam('q', q.trim() || null);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const { data, isPending, error, isFetching } = useOrders(params);
  if (me && !hasPermission(me, 'orders.read')) return <Forbidden />;

  const page = Number(params.get('page') ?? '1');
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Orders"
        description="Search and filter every order. Lists are paginated on the server."
        actions={
          hasPermission(me, 'orders.write') ? (
            <Button asChild>
              <Link href="/orders/new">
                <Plus className="size-4" /> New order
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative lg:col-span-2">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Order #, employee or company"
            className="pl-8"
            aria-label="Search orders"
          />
        </div>
        <Input
          type="date"
          aria-label="Delivery from"
          value={params.get('deliveryFrom') ?? ''}
          onChange={(e) => setParam('deliveryFrom', e.target.value || null)}
        />
        <Input
          type="date"
          aria-label="Delivery to"
          value={params.get('deliveryTo') ?? ''}
          onChange={(e) => setParam('deliveryTo', e.target.value || null)}
        />
        <Select value={params.get('status') ?? ALL} onValueChange={(v) => setParam('status', v)}>
          <SelectTrigger aria-label="Status" className="w-full">
            <SelectValue placeholder="Any status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any status</SelectItem>
            {ORDER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Select value={params.get('companyId') ?? ALL} onValueChange={(v) => setParam('companyId', v)}>
            <SelectTrigger aria-label="Company" className="w-full">
              <SelectValue placeholder="Company" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All companies</SelectItem>
              {companies.data?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={params.get('invoiced') ?? ALL} onValueChange={(v) => setParam('invoiced', v)}>
            <SelectTrigger aria-label="Invoiced" className="w-full">
              <SelectValue placeholder="Invoiced?" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Invoiced or not</SelectItem>
              <SelectItem value="true">Invoiced</SelectItem>
              <SelectItem value="false">Not invoiced</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead>Company</TableHead>
              <TableHead className="hidden md:table-cell">Employee</TableHead>
              <TableHead className="text-right">Boxes</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Invoice</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending &&
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {error && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-destructive">
                  {error.message}
                </TableCell>
              </TableRow>
            )}
            {data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  No orders match these filters.
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((o) => (
              <TableRow key={o.id} className="cursor-pointer" onClick={() => router.push(`/orders/${o.id}`)}>
                <TableCell className="font-medium">
                  <Link href={`/orders/${o.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                    {formatOrderNumber(o.number)}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(o.deliveryDate)} · {o.deliveryTime}
                </TableCell>
                <TableCell>{o.company.name}</TableCell>
                <TableCell className="hidden md:table-cell">{o.employee.name}</TableCell>
                <TableCell className="text-right tabular-nums">{o.boxes}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCents(o.totalCents)}</TableCell>
                <TableCell>
                  <OrderStatusBadge status={o.status as OrderStatus} />
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{o.invoiced ? 'Invoiced' : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>{data ? `${data.total} order${data.total === 1 ? '' : 's'}${isFetching ? ' · updating…' : ''}` : ' '}</span>
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

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersList />
    </Suspense>
  );
}
