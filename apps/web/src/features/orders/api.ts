'use client';

import type {
  CalendarDayDto,
  CreateOrderInput,
  CutoffDayDto,
  CutoffRunResultDto,
  EmployeeMenuDto,
  EmployeeSearchItemDto,
  OrderDetailDto,
  OrderInput,
  OrderingContextDto,
  OrderListItemDto,
  OrderWriteResultDto,
  Paginated,
  QuoteResponse,
  UpdateOrderInput,
} from '@fernleaf/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export const orderKeys = {
  all: ['orders'] as const,
  list: (params: string) => ['orders', 'list', params] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
};

export function useOrders(params: URLSearchParams) {
  const qs = params.toString();
  return useQuery({
    queryKey: orderKeys.list(qs),
    queryFn: ({ signal }) => apiFetch<Paginated<OrderListItemDto>>(`/orders?${qs}`, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: ({ signal }) => apiFetch<OrderDetailDto>(`/orders/${id}`, { signal }),
  });
}

export function useEmployeeSearch(q: string) {
  return useQuery({
    queryKey: ['ordering', 'employees', q],
    queryFn: ({ signal }) => apiFetch<EmployeeSearchItemDto[]>(`/ordering/employees?q=${encodeURIComponent(q)}`, { signal }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useOrderingContext(employeeId: string | null) {
  return useQuery({
    queryKey: ['ordering', 'context', employeeId],
    queryFn: ({ signal }) => apiFetch<OrderingContextDto>(`/ordering/context?employeeId=${employeeId}`, { signal }),
    enabled: !!employeeId,
  });
}

export function useOrderingCalendar(employeeId: string | null, from?: string, to?: string) {
  return useQuery({
    queryKey: ['ordering', 'calendar', employeeId, from, to],
    queryFn: ({ signal }) =>
      apiFetch<CalendarDayDto[]>(`/ordering/calendar?employeeId=${employeeId}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`, { signal }),
    enabled: !!employeeId,
  });
}

export function useEmployeeMenu(employeeId: string | null) {
  return useQuery({
    queryKey: ['ordering', 'menu', employeeId],
    queryFn: ({ signal }) => apiFetch<EmployeeMenuDto>(`/ordering/menu?employeeId=${employeeId}`, { signal }),
    enabled: !!employeeId,
  });
}

/** Server-side quote: the browser never does price maths (ADR-018). */
export function useQuote(input: OrderInput | null) {
  const key = input ? JSON.stringify(input) : null;
  return useQuery({
    queryKey: ['orders', 'quote', key],
    queryFn: ({ signal }) => apiFetch<QuoteResponse>('/orders/quote', { method: 'POST', body: input, signal }),
    enabled: !!input,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

function useInvalidateOrders() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: orderKeys.all });
}

export function useCreateOrder() {
  const invalidate = useInvalidateOrders();
  return useMutation({
    mutationFn: (body: CreateOrderInput) => apiFetch<OrderWriteResultDto>('/orders', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useUpdateOrder(id: string) {
  const invalidate = useInvalidateOrders();
  return useMutation({
    mutationFn: (body: UpdateOrderInput) => apiFetch<OrderWriteResultDto>(`/orders/${id}`, { method: 'PUT', body }),
    onSuccess: invalidate,
  });
}

export function useOrderAction(id: string) {
  const invalidate = useInvalidateOrders();
  return useMutation<unknown, Error, { kind: 'place'; version: number } | { kind: 'cancel' | 'reject'; reason: string }>({
    mutationFn: (action) =>
      action.kind === 'place'
        ? apiFetch<OrderWriteResultDto>(`/orders/${id}/place`, { method: 'POST', body: { version: action.version } })
        : apiFetch<OrderDetailDto>(`/orders/${id}/${action.kind}`, { method: 'POST', body: { reason: action.reason } }),
    onSuccess: invalidate,
  });
}

export function useDeliveryOverride(id: string) {
  const invalidate = useInvalidateOrders();
  return useMutation({
    mutationFn: (body: { version: number; deliveryTime?: string; addressId?: string; packagingTypeId?: string }) =>
      apiFetch<OrderDetailDto>(`/orders/${id}/delivery`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  });
}

export function useCutoffDays(from?: string, to?: string) {
  return useQuery({
    queryKey: ['cutoffs', from, to],
    queryFn: ({ signal }) => apiFetch<CutoffDayDto[]>(`/cutoffs${from && to ? `?from=${from}&to=${to}` : ''}`, { signal }),
  });
}

export function useRunCutoff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, closeEarly }: { date: string; closeEarly: boolean }) =>
      apiFetch<CutoffRunResultDto>(`/cutoffs/${date}/run`, { method: 'POST', body: { closeEarly } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cutoffs'] });
      void qc.invalidateQueries({ queryKey: orderKeys.all });
    },
  });
}
