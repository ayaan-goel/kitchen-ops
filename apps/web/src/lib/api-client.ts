import { isErrorEnvelope, type ErrorCode, type ErrorIssue } from '@fernleaf/shared';

/** An API failure carrying the server's error envelope (TRD §4.5). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK',
    message: string,
    readonly issues: ErrorIssue[] = [],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Same-origin call to the NestJS API (proxied by next.config.ts rewrites).
 * Sends the session cookie automatically and the CSRF header on every request.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      signal,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'fetch',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }

  if (res.status === 204) return undefined as T;
  const payload: unknown = await res.json().catch(() => null);
  if (res.ok) return payload as T;

  if (isErrorEnvelope(payload)) {
    throw new ApiError(
      res.status,
      payload.error.code,
      payload.error.message,
      payload.error.issues ?? [],
      payload.requestId,
    );
  }
  throw new ApiError(res.status, 'INTERNAL', `Request failed (${res.status}).`);
}
