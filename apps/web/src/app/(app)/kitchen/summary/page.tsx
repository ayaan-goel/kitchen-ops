'use client';

import { ArrowLeft, Flame, Snowflake } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Forbidden } from '@/components/forbidden';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useKitchenSummary } from '@/features/kitchen/api';
import { hasPermission, useMe } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { useMeta } from '@/lib/kitchen-time';

function CookList() {
  const params = useSearchParams();
  const { data: me } = useMe();
  const today = useMeta().data?.today ?? null;
  const date = params.get('date') ?? today;
  const { data, isPending } = useKitchenSummary(date);
  if (me && !hasPermission(me, 'kitchen.read')) return <Forbidden />;

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link href={`/kitchen${date && date !== today ? `?date=${date}` : ''}`}>
          <ArrowLeft className="size-4" /> Kitchen board
        </Link>
      </Button>
      <PageHeader
        title="Cook list"
        description={`Everything to cook for ${date ? formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' }) : '…'}, totalled across orders by dish and option combination.`}
      />
      {isPending && <Skeleton className="h-64 w-full" />}
      {data && data.dishes.length === 0 && <p className="text-sm text-muted-foreground">No confirmed orders for this date.</p>}
      {data && data.dishes.length > 0 && (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Station</TableHead>
                <TableHead>Dish</TableHead>
                <TableHead>Combinations</TableHead>
                <TableHead className="text-right">Boxes</TableHead>
                <TableHead className="text-right">Done</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.dishes.map((d) => (
                <TableRow key={d.dishId}>
                  <TableCell className="align-top text-sm text-muted-foreground">{d.stationName}</TableCell>
                  <TableCell className="align-top font-medium">
                    <span className="flex items-center gap-1.5">
                      {d.temperature === 'HOT' ? <Flame className="size-3.5 text-orange-500" aria-label="Hot" /> : <Snowflake className="size-3.5 text-sky-500" aria-label="Cold" />}
                      {d.dishName}
                    </span>
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    {d.combinations.map((c) => (
                      <div key={c.label}>
                        <span className="tabular-nums">{c.boxes} ×</span> {c.label}
                      </div>
                    ))}
                  </TableCell>
                  <TableCell className="text-right align-top font-semibold tabular-nums">{d.boxes}</TableCell>
                  <TableCell className="text-right align-top tabular-nums text-muted-foreground">{d.doneBoxes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}

export default function KitchenSummaryPage() {
  return (
    <Suspense>
      <CookList />
    </Suspense>
  );
}
