import type { NextFunction, Request, Response } from 'express';
import type { ErrorEnvelope } from '@fernleaf/shared';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF defence (TRD §4.7): mutating requests must carry `X-Requested-With: fetch`.
 * Cross-site HTML forms cannot set custom headers, and cross-origin fetch would need a CORS
 * preflight that this API never grants. Combined with SameSite=Lax cookies.
 */
export function requireFetchHeader(req: Request, res: Response, next: NextFunction): void {
  if (MUTATING.has(req.method) && req.get('x-requested-with') !== 'fetch') {
    const body: ErrorEnvelope = {
      error: { code: 'FORBIDDEN', message: 'Missing X-Requested-With header.' },
    };
    res.status(403).json(body);
    return;
  }
  next();
}
