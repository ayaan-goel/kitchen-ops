'use client';

import { Forbidden } from '@/components/forbidden';
import { PageHeader } from '@/components/page-header';
import { OrderForm } from '@/features/orders/order-form';
import { hasPermission, useMe } from '@/lib/auth';

export default function NewOrderPage() {
  const { data: me } = useMe();
  if (!me) return null;
  if (!hasPermission(me, 'orders.write')) return <Forbidden />;
  return (
    <>
      <PageHeader title="New order" description="Order boxed meals on behalf of an employee. Every rule is checked by the server as you go." />
      <OrderForm />
    </>
  );
}
