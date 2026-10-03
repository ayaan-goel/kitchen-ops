'use client';

import type { MetaResponse } from '@fernleaf/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch } from './api-client';

/**
 * Kitchen time comes from the server (GET /api/meta). The browser's clock is only used to tick
 * between refreshes, corrected by the measured server offset; its time zone is never used (NFR-02).
 */
export function useMeta() {
  return useQuery({
    queryKey: ['meta'],
    queryFn: async ({ signal }) => {
      const sentAt = Date.now();
      const meta = await apiFetch<MetaResponse>('/meta', { signal });
      const offsetMs = new Date(meta.now).getTime() - (sentAt + Date.now()) / 2;
      return { ...meta, offsetMs };
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}

/** Formats an instant in the kitchen time zone. */
export function formatKitchen(
  instant: Date | string,
  zone: string,
  options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false },
): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: zone, ...options }).format(new Date(instant));
}

/** Live "now" in the kitchen, re-rendering every `everyMs`. */
export function useKitchenNow(everyMs = 30_000): { now: Date | null; zone: string | null } {
  const meta = useMeta().data;
  const offsetMs = meta?.offsetMs;
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    if (offsetMs === undefined) return;
    const update = () => setNow(new Date(Date.now() + offsetMs));
    const first = setTimeout(update, 0);
    const id = setInterval(update, everyMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [everyMs, offsetMs]);
  return { now: meta ? now : null, zone: meta?.kitchenTimeZone ?? null };
}
