'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Forbidden } from '@/components/forbidden';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInvoices } from '@/features/billing/api';
import { InvoiceStatusBadge, SignedCents } from '@/features/billing/invoice-status-badge';
import { apiFetch } from '@/lib/api-client';
import { hasPermission, useMe } from '@/lib/auth';
import { formatDate, formatInvoiceNumber } from '@/lib/format';
import { formatKitchen, useMeta } from '@/lib/kitchen-time';

const ALL = '__all';

function InvoiceList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: me } = useMe();
  const zone = useMeta().data?.kitchenTimeZone ?? 'Asia/Kolkata';
  const companies = useQuery({
    queryKey: ['lookups', 'companies'],
    queryFn: ({ signal }) => apiFetch<{ id: string; name: string }[]>('/lookups/companies', { signal }),
    staleTime: 5 * 60_000,
  });
  const page = Number(params.get('page') ?? '1');
  const { data, isPending, error } = useInvoices({
    companyId: params.get('companyId') ?? undefined,
    status: params.get('status') ?? undefined,
    page,
  });

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value && value !== ALL) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    router.replace(`${pathname}?${next.toString()}`);
  };

  if (me && !hasPermission(me, 'billing.read')) return <Forbidden />;
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link href="/billing">
          <ArrowLeft className="size-4" /> Billing
        </Link>
      </Button>
      <PageHeader title="Invoices" description="Issued invoices are immutable; only their paid status changes." />

      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
        <Select value={params.get('status') ?? ALL} onValueChange={(v) => setParam('status', v)}>
          <SelectTrigger aria-label="Status" className="w-full">
            <SelectValue placeholder="Any status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Paid or unpaid</SelectItem>
            <SelectItem value="ISSUED">Unpaid</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Company</TableHead>
              <TableHead className="hidden md:table-cell">Issued</TableHead>
              <TableHead className="hidden lg:table-cell">Deliveries</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-16 w-full" />
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-destructive">
                  {error.message}
                </TableCell>
              </TableRow>
            )}
            {data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No invoices match.
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((inv) => (
              <TableRow key={inv.id} className="cursor-pointer" onClick={() => router.push(`/billing/invoices/${inv.id}`)}>
                <TableCell className="font-medium">
                  <Link href={`/billing/invoices/${inv.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                    {formatInvoiceNumber(inv.number)}
                  </Link>
                </TableCell>
                <TableCell>{inv.company.name}</TableCell>
                <TableCell className="hidden text-sm md:table-cell">
                  {formatKitchen(inv.issuedAt, zone, { day: 'numeric', month: 'short', year: 'numeric' })}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                  {inv.periodStart && inv.periodEnd ? `${formatDate(inv.periodStart)} – ${formatDate(inv.periodEnd)}` : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <SignedCents cents={inv.totalCents} />
                </TableCell>
                <TableCell>
                  <InvoiceStatusBadge status={inv.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>{data ? `${data.total} invoice${data.total === 1 ? '' : 's'}` : ' '}</span>
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

export default function InvoicesPage() {
  return (
    <Suspense>
      <InvoiceList />
    </Suspense>
  );
}
