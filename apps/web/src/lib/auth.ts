'use client';

import type { MeResponse, Permission } from '@fernleaf/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api-client';

export const meQueryKey = ['auth', 'me'] as const;

/** The signed-in user. A 401 surfaces as an ApiError; the app shell redirects to /login. */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: ({ signal }) => apiFetch<MeResponse>('/auth/me', { signal }),
    staleTime: 60_000,
    retry: false,
  });
}

export function hasPermission(me: MeResponse | undefined, permission: Permission): boolean {
  return !!me && me.permissions.includes(permission);
}
