'use client';

import { useParams } from 'next/navigation';
import { Forbidden } from '@/components/forbidden';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrder } from '@/features/orders/api';
import { OrderForm } from '@/features/orders/order-form';
import { hasPermission, useMe } from '@/lib/auth';
import { formatOrderNumber } from '@/lib/format';

export default function EditOrderPage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const { data: order, isPending, error } = useOrder(id);
  if (me && !hasPermission(me, 'orders.write')) return <Forbidden />;
  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (error || !order) return <p className="text-sm text-destructive">{error?.message ?? 'Order not found'}</p>;
  return (
    <>
      <PageHeader
        title={`Edit ${formatOrderNumber(order.number)}`}
        description={
          order.status === 'DRAFT'
            ? 'Drafts are re-priced at current prices when saved or placed.'
            : 'Unchanged lines keep the prices captured when they were ordered; changed lines use today’s prices.'
        }
      />
      <OrderForm key={`${order.id}:${order.version}`} existing={order} />
    </>
  );
}
