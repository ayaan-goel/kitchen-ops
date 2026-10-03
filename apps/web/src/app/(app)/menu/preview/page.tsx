'use client';

import type { EmployeeSearchItemDto, MenuCategoryDto } from '@fernleaf/shared';
import { ArrowLeft, Flame, Lock, Snowflake } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Forbidden } from '@/components/forbidden';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMenuPreview } from '@/features/catalogue/api';
import { EmployeePicker } from '@/features/orders/employee-picker';
import { hasPermission, useMe } from '@/lib/auth';
import { formatCents } from '@/lib/format';

const REASON: Record<string, string> = {
  HIDDEN: 'Hidden for this company',
  INACTIVE: 'Inactive',
  NO_PRICE: 'No price on this company’s tier',
  UNORDERABLE: 'A required choice has no available option',
  EMPTY: 'Nothing orderable inside',
};

/**
 * The menu exactly as one employee would see it (MENU-04): their company's tier prices, hidden
 * categories removed, secret categories they can reach by link, and what was left out and why.
 */
export default function MenuPreviewPage() {
  const { data: me } = useMe();
  const [employee, setEmployee] = useState<EmployeeSearchItemDto | null>(null);
  const { data, isFetching, error } = useMenuPreview(employee?.id ?? null);
  if (me && !hasPermission(me, 'menu.read')) return <Forbidden />;

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link href="/menu">
          <ArrowLeft className="size-4" /> Menu
        </Link>
      </Button>
      <PageHeader title="Menu preview" description="Pick an employee to see the menu, prices and choices exactly as they would when ordering." />
      <div className="mb-6 max-w-lg">
        <EmployeePicker value={employee} onChange={setEmployee} />
      </div>
      {isFetching && !data && <Skeleton className="h-64 w-full" />}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {data && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-6">
            <p className="text-sm">
              <span className="font-medium">{data.employee.name}</span> · {data.employee.company} · priced on <span className="font-medium">{data.tier.name}</span>
              {data.tier.isDefault ? ' (default tier)' : ''}
            </p>
            {data.listed.map((c) => (
              <Category key={c.id} category={c} />
            ))}
            {data.secret.length > 0 && (
              <div className="space-y-4 rounded-xl border border-dashed p-4">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Lock className="size-4" aria-hidden /> Not listed, reachable by link
                </p>
                {data.secret.map((c) => (
                  <Category key={c.id} category={c} />
                ))}
              </div>
            )}
          </div>
          <aside className="h-fit rounded-xl border bg-card p-4 lg:sticky lg:top-20">
            <h2 className="mb-2 font-semibold">Left out ({data.excluded.length})</h2>
            {data.excluded.length === 0 && <p className="text-sm text-muted-foreground">Everything on the menu is available to this employee.</p>}
            <ul className="space-y-2 text-sm">
              {data.excluded.map((e, i) => (
                <li key={i}>
                  <span className="font-medium">{e.name}</span>
                  {e.kind === 'ITEM' && <span className="text-muted-foreground"> · {e.category}</span>}
                  <span className="block text-xs text-status-late">{REASON[e.reason] ?? e.reason}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}
    </>
  );
}

function Category({ category }: { category: MenuCategoryDto }) {
  return (
    <section aria-label={category.name}>
      <h2 className="mb-2 font-semibold">{category.name}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {category.items.map(({ menuItemId, dish }) => (
          <article key={menuItemId} className="rounded-xl border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="flex items-center gap-1.5 font-medium">
                {dish.temperature === 'HOT' ? <Flame className="size-3.5 text-orange-500" aria-label="Hot" /> : <Snowflake className="size-3.5 text-sky-500" aria-label="Cold" />}
                {dish.name}
              </p>
              <span className="font-semibold tabular-nums">{formatCents(dish.priceCents)}</span>
            </div>
            {dish.description && <p className="mt-0.5 text-xs text-muted-foreground">{dish.description}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              {[...dish.allergens.map((a) => `contains ${a}`), ...dish.dietaryTags].join(' · ')}
              {dish.minOrderQty ? ` · min ${dish.minOrderQty}` : ''}
            </p>
            {dish.groups.map((g) => (
              <div key={g.id} className="mt-2 text-xs">
                <span className="font-medium">
                  {g.name}
                  {g.isRequired ? ' (required' : ' (optional'}
                  {g.maxSelections > 1 ? `, up to ${g.maxSelections})` : ')'}
                </span>
                <span className="block text-muted-foreground">
                  {g.options
                    .map((o) => `${o.name}${o.priceCents ? ` +${formatCents(o.priceCents)}` : ''}${g.usesPortions ? ` [${o.portions.map((p) => `${p.name}${p.extraCents ? ` +${formatCents(p.extraCents)}` : ''}`).join(', ')}]` : ''}`)
                    .join(' · ')}
                </span>
              </div>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}
