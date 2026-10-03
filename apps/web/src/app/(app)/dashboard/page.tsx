'use client';

import type { DashboardKind } from '@fernleaf/shared';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMe } from '@/lib/auth';

const DASHBOARD_COPY: Record<DashboardKind, { title: string; description: string }> = {
  ADMIN: { title: 'Admin dashboard', description: "Today's service, next cut-off, receivables and catalogue health." },
  KITCHEN: { title: 'Kitchen dashboard', description: 'What to cook today, by when, and what is slipping.' },
  DISPATCH: { title: 'Dispatch dashboard', description: 'What must leave, with whom, and what is late.' },
  DRIVER: { title: 'My day', description: 'Your drops for today, in time order.' },
};

export default function DashboardPage() {
  const { data: me } = useMe();
  if (!me) return null;
  const copy = DASHBOARD_COPY[me.role.dashboard];
  const firstName = me.user.name.split(' ')[0];

  return (
    <>
      <PageHeader title={`Hello, ${firstName}`} description={copy.description} />
      <Card>
        <CardHeader>
          <CardTitle>{copy.title}</CardTitle>
          <CardDescription>Figures arrive in Phase 8. Your role is {me.role.name}.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          You can use {me.permissions.length} permission{me.permissions.length === 1 ? '' : 's'} in this panel.
        </CardContent>
      </Card>
    </>
  );
}
