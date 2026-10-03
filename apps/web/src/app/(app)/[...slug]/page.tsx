'use client';

import { Construction } from 'lucide-react';
import { notFound, usePathname } from 'next/navigation';
import { Forbidden } from '@/components/forbidden';
import { PageHeader } from '@/components/page-header';
import { hasPermission, useMe } from '@/lib/auth';
import { routeFor } from '@/lib/route-manifest';

/**
 * Placeholder for areas that are planned but not built yet. Real pages (e.g. app/(app)/orders)
 * take precedence over this catch-all as they are added.
 */
export default function PlannedAreaPage() {
  const pathname = usePathname();
  const { data: me } = useMe();
  const route = routeFor(pathname);
  if (!route) notFound();
  if (!me) return null;
  if (!hasPermission(me, route.permission)) return <Forbidden />;

  return (
    <>
      <PageHeader title={route.label} />
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
        <Construction className="size-8" aria-hidden />
        This area is being built.
      </div>
    </>
  );
}
