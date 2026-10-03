'use client';

import type { KitchenBoardDto, KitchenSummaryDto, UnitActionResultDto } from '@fernleaf/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, apiFetch } from '@/lib/api-client';

export const kitchenKeys = {
  board: (date: string) => ['kitchen', 'board', date] as const,
  summary: (date: string) => ['kitchen', 'summary', date] as const,
};

/** Live board: refreshed every 15 s and on focus so several cooks see each other's progress. */
export function useKitchenBoard(date: string | null) {
  return useQuery({
    queryKey: kitchenKeys.board(date ?? ''),
    queryFn: ({ signal }) => apiFetch<KitchenBoardDto>(`/kitchen/board?date=${date}`, { signal }),
    enabled: !!date,
    refetchInterval: 15_000,
  });
}

export function useKitchenSummary(date: string | null) {
  return useQuery({
    queryKey: kitchenKeys.summary(date ?? ''),
    queryFn: ({ signal }) => apiFetch<KitchenSummaryDto>(`/kitchen/summary?date=${date}`, { signal }),
    enabled: !!date,
    refetchInterval: 30_000,
  });
}

/** Start / done with an optimistic update; a 409 (someone else was first) rolls back with the reason. */
export function useUnitAction(date: string) {
  const qc = useQueryClient();
  const key = kitchenKeys.board(date);
  return useMutation({
    mutationFn: ({ unitId, action }: { unitId: string; action: 'start' | 'done' }) =>
      apiFetch<UnitActionResultDto>(`/kitchen/units/${unitId}/${action}`, { method: 'POST' }),
    onMutate: async ({ unitId, action }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<KitchenBoardDto>(key);
      if (previous) {
        const now = new Date().toISOString();
        qc.setQueryData<KitchenBoardDto>(key, {
          ...previous,
          units: previous.units.map((u) =>
            u.id !== unitId
              ? u
              : action === 'start'
                ? { ...u, status: 'IN_PROGRESS', startedAt: now }
                : { ...u, status: 'DONE', risk: 'DONE', startedAt: u.startedAt ?? now, doneAt: now },
          ),
        });
      }
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      toast.error(err instanceof ApiError ? err.message : 'Could not update the unit');
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['kitchen'] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useForceComplete(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<UnitActionResultDto['order']>(`/orders/${orderId}/force-complete`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kitchen'] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
