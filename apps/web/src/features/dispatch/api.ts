'use client';

import type { AssignableDriverDto, DispatchBoardDto, DriverDayDto, DropDto, DropStage, PhotoUploadDto } from '@fernleaf/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, apiFetch } from '@/lib/api-client';

export const dispatchKeys = {
  board: (date: string) => ['dispatch', 'board', date] as const,
  drivers: (date: string) => ['dispatch', 'drivers', date] as const,
  driverDay: ['driver', 'day'] as const,
};

const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiError ? (err.issues[0]?.message ?? err.message) : fallback);

/** Live board: refreshed every 15 s, like the kitchen board, so dispatch sees kitchen progress. */
export function useDispatchBoard(date: string | null) {
  return useQuery({
    queryKey: dispatchKeys.board(date ?? ''),
    queryFn: ({ signal }) => apiFetch<DispatchBoardDto>(`/dispatch/drops?date=${date}`, { signal }),
    enabled: !!date,
    refetchInterval: 15_000,
  });
}

export function useDrivers(date: string | null) {
  return useQuery({
    queryKey: dispatchKeys.drivers(date ?? ''),
    queryFn: ({ signal }) => apiFetch<AssignableDriverDto[]>(`/dispatch/drivers?date=${date}`, { signal }),
    enabled: !!date,
    staleTime: 60_000,
  });
}

export type DropStep = 'dispatch-ready' | 'out-for-delivery' | 'delivered';
const NEXT_STAGE: Record<DropStep, DropStage> = {
  'dispatch-ready': 'DISPATCH_READY',
  'out-for-delivery': 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED',
};

/** Replaces one drop in the cached board, returning the previous board for rollback. */
function useBoardPatch(date: string) {
  const qc = useQueryClient();
  const key = dispatchKeys.board(date);
  return {
    qc,
    key,
    patch: async (dropId: string, change: (d: DropDto) => DropDto) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<DispatchBoardDto>(key);
      if (previous) qc.setQueryData<DispatchBoardDto>(key, { ...previous, drops: previous.drops.map((d) => (d.id === dropId ? change(d) : d)) });
      return previous;
    },
  };
}

/** Stage steps with an optimistic update; a refusal (409/422) rolls back and explains why. */
export function useDropStep(date: string) {
  const { qc, key, patch } = useBoardPatch(date);
  return useMutation({
    mutationFn: ({ dropId, step, note }: { dropId: string; step: DropStep; note?: string }) =>
      apiFetch<DropDto>(`/dispatch/drops/${dropId}/${step}`, { method: 'POST', body: step === 'delivered' ? { note: note || undefined } : {} }),
    onMutate: async ({ dropId, step }) => ({ previous: await patch(dropId, (d) => ({ ...d, stage: NEXT_STAGE[step], risk: step === 'dispatch-ready' ? d.risk : 'DONE' })) }),
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      toast.error(errorMessage(err, 'Could not update the drop'));
    },
    onSuccess: (drop) => {
      const board = qc.getQueryData<DispatchBoardDto>(key);
      if (board) qc.setQueryData<DispatchBoardDto>(key, { ...board, drops: board.drops.map((d) => (d.id === drop.id ? drop : d)) });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['dispatch'] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useAssignDriver(date: string) {
  const { qc, key, patch } = useBoardPatch(date);
  return useMutation({
    mutationFn: ({ dropId, driver }: { dropId: string; driver: AssignableDriverDto | null }) =>
      apiFetch<DropDto>(`/dispatch/drops/${dropId}/driver`, { method: 'PATCH', body: { driverId: driver?.id ?? null } }),
    onMutate: async ({ dropId, driver }) => ({
      previous: await patch(dropId, (d) => ({ ...d, driver: driver ? { id: driver.id, name: driver.name, phone: driver.phone } : null })),
    }),
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      toast.error(errorMessage(err, 'Could not assign the driver'));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['dispatch'] });
    },
  });
}

// ─── driver ───

export function useDriverDay() {
  return useQuery({
    queryKey: dispatchKeys.driverDay,
    queryFn: ({ signal }) => apiFetch<DriverDayDto>('/driver/drops', { signal }),
    refetchInterval: 30_000,
  });
}

export function usePickedUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dropId: string) => apiFetch<DropDto>(`/driver/drops/${dropId}/picked-up`, { method: 'POST', body: {} }),
    onError: (err) => toast.error(errorMessage(err, 'Could not mark it picked up')),
    onSettled: () => qc.invalidateQueries({ queryKey: dispatchKeys.driverDay }),
  });
}

/** Uploads the (already compressed) photo, then marks the drop delivered. */
export function useDriverDeliver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ dropId, note, photo }: { dropId: string; note: string; photo: Blob | null }) => {
      let photoId: string | undefined;
      if (photo) {
        const form = new FormData();
        form.append('file', photo, 'delivery.jpg');
        photoId = (await apiFetch<PhotoUploadDto>(`/driver/drops/${dropId}/photo`, { method: 'POST', body: form })).photoId;
      }
      return apiFetch<DropDto>(`/driver/drops/${dropId}/delivered`, { method: 'POST', body: { note: note.trim() || undefined, photoId } });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: dispatchKeys.driverDay }),
  });
}

/**
 * Shrinks a phone photo before upload (A-35): longest side ≤ 1600 px, JPEG ~80 %, usually
 * 200–600 KB. Falls back to the original file if the browser can't decode it.
 */
export async function compressPhoto(file: File, maxSide = 1600): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
