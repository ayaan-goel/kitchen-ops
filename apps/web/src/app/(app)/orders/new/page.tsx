'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Forbidden } from '@/components/forbidden';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useEmployee } from '@/features/admin/api';
import { OrderForm } from '@/features/orders/order-form';
import { hasPermission, useMe } from '@/lib/auth';

function NewOrder() {
  const { data: me } = useMe();
  // "New order" from an employee's page arrives with ?employeeId= and starts with them picked.
  const employeeId = useSearchParams().get('employeeId');
  const canReadEmployees = hasPermission(me, 'employees.read');
  const { data: employee, isPending } = useEmployee(employeeId && canReadEmployees ? employeeId : null);
  if (!me) return null;
  if (!hasPermission(me, 'orders.write')) return <Forbidden />;
  if (employeeId && canReadEmployees && isPending) return <Skeleton className="h-96 w-full" />;
  return (
    <>
      <PageHeader title="New order" description="Order boxed meals on behalf of an employee. Every rule is checked by the server as you go." />
      <OrderForm
        key={employee?.id ?? 'blank'}
        initialEmployee={employee ? { id: employee.id, name: employee.name, email: employee.email, companyId: employee.companyId, companyName: employee.companyName } : undefined}
      />
    </>
  );
}

export default function NewOrderPage() {
  return (
    <Suspense>
      <NewOrder />
    </Suspense>
  );
}
