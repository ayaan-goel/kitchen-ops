'use client';

import type {
  DishDetailDto,
  DishInput,
  DishListItemDto,
  EmployeeMenuDto,
  MenuAdminCategoryDto,
  OptionDto,
  OptionGroupsInput,
  OptionInput,
  Paginated,
  PriceSetInput,
  PriceTierDto,
  ReferenceItemDto,
  ReferenceKind,
  TierGridDto,
  TierInput,
} from '@fernleaf/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, apiFetch } from '@/lib/api-client';

export const catalogueKeys = {
  reference: (kind: ReferenceKind) => ['catalogue', 'reference', kind] as const,
  options: ['catalogue', 'options'] as const,
  dishes: (qs: string) => ['catalogue', 'dishes', qs] as const,
  dish: (id: string) => ['catalogue', 'dish', id] as const,
  tiers: ['catalogue', 'tiers'] as const,
  grid: (id: string, kind: string) => ['catalogue', 'grid', id, kind] as const,
  menu: ['catalogue', 'menu'] as const,
  preview: (employeeId: string) => ['catalogue', 'preview', employeeId] as const,
};

export const errorText = (err: unknown, fallback = 'Something went wrong') =>
  err instanceof ApiError ? (err.issues[0]?.message && err.issues.length === 1 ? err.issues[0].message : err.message) : fallback;

/** Catalogue edits change what can be ordered and at what price: refresh menus and quotes too. */
function useInvalidateCatalogue() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['catalogue'] });
    void qc.invalidateQueries({ queryKey: ['ordering'] });
  };
}

export function useReference(kind: ReferenceKind) {
  return useQuery({
    queryKey: catalogueKeys.reference(kind),
    queryFn: ({ signal }) => apiFetch<ReferenceItemDto[]>(`/reference/${kind}`, { signal }),
    staleTime: 60_000,
  });
}

export function useReferenceWrite(kind: ReferenceKind) {
  const qc = useQueryClient();
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: (op: { type: 'create'; name: string; description?: string } | { type: 'update'; id: string; name?: string; description?: string; isActive?: boolean } | { type: 'reorder'; ids: string[] }) =>
      op.type === 'create'
        ? apiFetch<ReferenceItemDto[]>(`/reference/${kind}`, { method: 'POST', body: { name: op.name, description: op.description } })
        : op.type === 'update'
          ? apiFetch<ReferenceItemDto[]>(`/reference/${kind}/${op.id}`, { method: 'PATCH', body: { name: op.name, description: op.description, isActive: op.isActive } })
          : apiFetch<ReferenceItemDto[]>(`/reference/${kind}/order`, { method: 'PUT', body: { ids: op.ids } }),
    onSuccess: (rows) => {
      qc.setQueryData(catalogueKeys.reference(kind), rows);
      invalidate();
    },
    onError: (err) => toast.error(errorText(err)),
  });
}

export function useOptions() {
  return useQuery({ queryKey: catalogueKeys.options, queryFn: ({ signal }) => apiFetch<OptionDto[]>('/options', { signal }) });
}

export function useSaveOption() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: OptionInput }) =>
      apiFetch<OptionDto>(id ? `/options/${id}` : '/options', { method: id ? 'PUT' : 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useDishes(params: URLSearchParams) {
  const qs = params.toString();
  return useQuery({
    queryKey: catalogueKeys.dishes(qs),
    queryFn: ({ signal }) => apiFetch<Paginated<DishListItemDto>>(`/dishes?${qs}`, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useAllDishes() {
  return useQuery({
    queryKey: catalogueKeys.dishes('pageSize=100'),
    queryFn: ({ signal }) => apiFetch<Paginated<DishListItemDto>>('/dishes?pageSize=100', { signal }),
    staleTime: 60_000,
  });
}

export function useDish(id: string | null) {
  return useQuery({
    queryKey: catalogueKeys.dish(id ?? ''),
    queryFn: ({ signal }) => apiFetch<DishDetailDto>(`/dishes/${id}`, { signal }),
    enabled: !!id,
  });
}

export function useSaveDish() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: DishInput }) =>
      apiFetch<DishDetailDto>(id ? `/dishes/${id}` : '/dishes', { method: id ? 'PUT' : 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useSaveGroups(dishId: string) {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: (input: OptionGroupsInput) => apiFetch<DishDetailDto>(`/dishes/${dishId}/option-groups`, { method: 'PUT', body: input }),
    onSuccess: invalidate,
  });
}

export function useTiers() {
  return useQuery({ queryKey: catalogueKeys.tiers, queryFn: ({ signal }) => apiFetch<PriceTierDto[]>('/price-tiers', { signal }) });
}

export function useSaveTier() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: TierInput }) =>
      apiFetch<PriceTierDto>(id ? `/price-tiers/${id}` : '/price-tiers', { method: id ? 'PUT' : 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useMakeDefaultTier() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: (id: string) => apiFetch<PriceTierDto[]>(`/price-tiers/${id}/make-default`, { method: 'POST', body: {} }),
    onSuccess: invalidate,
    onError: (err) => toast.error(errorText(err)),
  });
}

export function useTierGrid(id: string, kind: 'dishes' | 'options') {
  return useQuery({
    queryKey: catalogueKeys.grid(id, kind),
    queryFn: ({ signal }) => apiFetch<TierGridDto>(`/price-tiers/${id}/grid?kind=${kind}`, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useSetPrice(tierId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: (input: PriceSetInput) => apiFetch<TierGridDto>(`/price-tiers/${tierId}/prices`, { method: 'PUT', body: input }),
    onSuccess: (grid) => {
      qc.setQueryData(catalogueKeys.grid(tierId, grid.kind), grid);
      invalidate();
    },
    onError: (err) => toast.error(errorText(err)),
  });
}

export function useMenuAdmin() {
  return useQuery({ queryKey: catalogueKeys.menu, queryFn: ({ signal }) => apiFetch<MenuAdminCategoryDto[]>('/menu/categories', { signal }) });
}

type MenuOp =
  | { type: 'create'; input: Record<string, unknown> }
  | { type: 'update'; id: string; input: Record<string, unknown> }
  | { type: 'reorder'; ids: string[] }
  | { type: 'addItem'; categoryId: string; dishId: string }
  | { type: 'itemActive'; id: string; isActive: boolean }
  | { type: 'removeItem'; id: string }
  | { type: 'reorderItems'; categoryId: string; ids: string[] };

export function useMenuWrite() {
  const qc = useQueryClient();
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: (op: MenuOp) => {
      const call = (path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: unknown) => apiFetch<MenuAdminCategoryDto[]>(path, { method, body });
      switch (op.type) {
        case 'create':
          return call('/menu/categories', 'POST', op.input);
        case 'update':
          return call(`/menu/categories/${op.id}`, 'PUT', op.input);
        case 'reorder':
          return call('/menu/categories/order', 'PUT', { ids: op.ids });
        case 'addItem':
          return call(`/menu/categories/${op.categoryId}/items`, 'POST', { dishId: op.dishId });
        case 'itemActive':
          return call(`/menu/items/${op.id}`, 'PATCH', { isActive: op.isActive });
        case 'removeItem':
          return call(`/menu/items/${op.id}`, 'DELETE');
        case 'reorderItems':
          return call(`/menu/categories/${op.categoryId}/items/order`, 'PUT', { ids: op.ids });
      }
    },
    onSuccess: (rows) => {
      qc.setQueryData(catalogueKeys.menu, rows);
      invalidate();
    },
  });
}

export function useMenuPreview(employeeId: string | null) {
  return useQuery({
    queryKey: catalogueKeys.preview(employeeId ?? ''),
    queryFn: ({ signal }) => apiFetch<EmployeeMenuDto & { employee: { id: string; name: string; company: string } }>(`/menu/preview?employeeId=${employeeId}`, { signal }),
    enabled: !!employeeId,
  });
}

/** Moves one id up or down in a list (for the ↑/↓ reorder buttons). */
export function moved(ids: string[], id: string, delta: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const next = [...ids];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}
