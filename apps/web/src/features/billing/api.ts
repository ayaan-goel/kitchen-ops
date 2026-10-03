'use client';

import type {
  BillingCompanyDto,
  CompanyBillableDto,
  CreateAdjustmentInput,
  CreateInvoiceInput,
  InvoiceDetailDto,
  InvoiceListItemDto,
  MarkPaidInput,
  Paginated,
} from '@fernleaf/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export const billingKeys = {
  all: ['billing'] as const,
  companies: ['billing', 'companies'] as const,
  billable: (companyId: string, from: string, to: string) => ['billing', 'billable', companyId, from, to] as const,
  invoices: (qs: string) => ['billing', 'invoices', qs] as const,
  invoice: (id: string) => ['billing', 'invoice', id] as const,
};

export function useBillingCompanies() {
  return useQuery({
    queryKey: billingKeys.companies,
    queryFn: ({ signal }) => apiFetch<BillingCompanyDto[]>('/billing/companies', { signal }),
  });
}

export function useCompanyBillable(companyId: string, from: string, to: string) {
  const qs = new URLSearchParams();
  if (from) qs.set('deliveryFrom', from);
  if (to) qs.set('deliveryTo', to);
  return useQuery({
    queryKey: billingKeys.billable(companyId, from, to),
    queryFn: ({ signal }) => apiFetch<CompanyBillableDto>(`/billing/companies/${companyId}/billable?${qs.toString()}`, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useInvoices(params: { companyId?: string; status?: string; page?: number; pageSize?: number }) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
  const key = qs.toString();
  return useQuery({
    queryKey: billingKeys.invoices(key),
    queryFn: ({ signal }) => apiFetch<Paginated<InvoiceListItemDto>>(`/billing/invoices?${key}`, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: billingKeys.invoice(id),
    queryFn: ({ signal }) => apiFetch<InvoiceDetailDto>(`/billing/invoices/${id}`, { signal }),
  });
}

/** Billing writes change order state (invoice links, credits), so order caches are refreshed too. */
function useInvalidateBilling() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: billingKeys.all });
    void qc.invalidateQueries({ queryKey: ['orders'] });
  };
}

export function useCreateInvoice() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: (input: CreateInvoiceInput) => apiFetch<InvoiceDetailDto>('/billing/invoices', { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useMarkPaid(id: string) {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: (input: MarkPaidInput) => apiFetch<InvoiceDetailDto>(`/billing/invoices/${id}/mark-paid`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useAddAdjustment(orderId: string) {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: (input: CreateAdjustmentInput) => apiFetch<{ orderId: string }>(`/orders/${orderId}/adjustments`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}
