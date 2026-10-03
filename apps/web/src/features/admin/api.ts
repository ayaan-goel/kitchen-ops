'use client';

import type {
  CompanyDetailDto,
  CompanyListItemDto,
  EmployeeDetailDto,
  EmployeeImportReportDto,
  EmployeeListItemDto,
  Paginated,
  RoleDto,
  SettingsDto,
  StaffDto,
} from '@fernleaf/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export const adminKeys = {
  companies: ['admin', 'companies'] as const,
  company: (id: string) => ['admin', 'company', id] as const,
  employees: (qs: string) => ['admin', 'employees', qs] as const,
  employee: (id: string) => ['admin', 'employee', id] as const,
  staff: ['admin', 'staff'] as const,
  roles: ['admin', 'roles'] as const,
  settings: ['admin', 'settings'] as const,
};

/** Company/employee/settings changes affect ordering, menus, cut-off and billing views. */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    for (const key of [['admin'], ['ordering'], ['catalogue'], ['lookups'], ['cutoffs'], ['meta']]) void qc.invalidateQueries({ queryKey: key });
  };
}

export function useCompanies() {
  return useQuery({ queryKey: adminKeys.companies, queryFn: ({ signal }) => apiFetch<CompanyListItemDto[]>('/companies', { signal }) });
}

export function useCompany(id: string) {
  return useQuery({ queryKey: adminKeys.company(id), queryFn: ({ signal }) => apiFetch<CompanyDetailDto>(`/companies/${id}`, { signal }) });
}

/** Any company write returns the full detail; it replaces the cache directly. */
export function useCompanyWrite(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: 'POST' | 'PUT' | 'DELETE'; body?: unknown }) =>
      apiFetch<CompanyDetailDto>(`/companies/${id}${path}`, { method, body }),
    onSuccess: (company) => {
      qc.setQueryData(adminKeys.company(id), company);
      invalidate();
    },
  });
}

export function useCreateCompany() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: { name: string; billingContactName: string; billingEmail: string; domain: string }) => apiFetch<CompanyDetailDto>('/companies', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useEmployees(params: URLSearchParams) {
  const qs = params.toString();
  return useQuery({
    queryKey: adminKeys.employees(qs),
    queryFn: ({ signal }) => apiFetch<Paginated<EmployeeListItemDto>>(`/employees?${qs}`, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useEmployee(id: string | null) {
  return useQuery({
    queryKey: adminKeys.employee(id ?? ''),
    queryFn: ({ signal }) => apiFetch<EmployeeDetailDto>(`/employees/${id}`, { signal }),
    enabled: !!id,
  });
}

export function useSaveEmployee() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Record<string, unknown> }) =>
      apiFetch<EmployeeDetailDto>(id ? `/employees/${id}` : '/employees', { method: id ? 'PUT' : 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useMoveEmployee(id: string) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: { companyId: string; email: string }) => apiFetch<EmployeeDetailDto>(`/employees/${id}/move`, { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useImportEmployees(companyId: string) {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ file, dryRun }: { file: File; dryRun: boolean }) => {
      const form = new FormData();
      form.append('file', file);
      return apiFetch<EmployeeImportReportDto>(`/companies/${companyId}/employees/import?dryRun=${dryRun}`, { method: 'POST', body: form });
    },
    onSuccess: (report) => {
      if (!report.dryRun) invalidate();
    },
  });
}

export function useStaff() {
  return useQuery({ queryKey: adminKeys.staff, queryFn: ({ signal }) => apiFetch<StaffDto[]>('/staff', { signal }) });
}

export function useRoles() {
  return useQuery({ queryKey: adminKeys.roles, queryFn: ({ signal }) => apiFetch<RoleDto[]>('/roles', { signal }), staleTime: 5 * 60_000 });
}

export function useStaffWrite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: 'POST' | 'PATCH'; body: unknown }) => apiFetch<StaffDto[]>(`/staff${path}`, { method, body }),
    onSuccess: (rows) => qc.setQueryData(adminKeys.staff, rows),
  });
}

export function useSettings() {
  return useQuery({ queryKey: adminKeys.settings, queryFn: ({ signal }) => apiFetch<SettingsDto>('/settings', { signal }) });
}

export function useSettingsWrite() {
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: 'PUT' | 'POST' | 'DELETE'; body?: unknown }) => apiFetch<SettingsDto>(`/settings${path}`, { method, body }),
    onSuccess: (s) => {
      qc.setQueryData(adminKeys.settings, s);
      invalidate();
    },
  });
}

export function useDriversList() {
  // Assignable drivers (permission-based); the date only affects the load counts, not the list.
  return useQuery({
    queryKey: ['admin', 'drivers'],
    queryFn: ({ signal }) => apiFetch<{ id: string; name: string }[]>('/dispatch/drivers', { signal }),
    staleTime: 5 * 60_000,
  });
}
