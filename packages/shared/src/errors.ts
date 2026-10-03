/**
 * Error codes and the error envelope shared by api and web (TRD §4.5).
 */
export const ERROR_CODES = [
  // generic
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT_STALE',
  'INVALID_TRANSITION',
  'RATE_LIMITED',
  'INTERNAL',
  'IN_USE',
  // ordering
  'CUTOFF_PASSED',
  'DATE_NOT_DELIVERABLE',
  'NOT_ON_MENU',
  'PRICE_MISSING',
  'COMBINATION_QTY_MISMATCH',
  'REQUIRED_GROUP_MISSING',
  'TOO_MANY_SELECTIONS',
  'OPTION_NOT_IN_GROUP',
  'OPTION_UNAVAILABLE',
  'PORTION_INVALID',
  'DUPLICATE_COMBINATION',
  'DUPLICATE_DISH_LINE',
  'BELOW_MIN_ORDER_QTY',
  'DELIVERY_OPTION_NOT_ALLOWED',
  'ADDRESS_INVALID',
  'TIME_OUTSIDE_WINDOW',
  // kitchen / dispatch
  'ORDER_NOT_CONFIRMED',
  'UNIT_ALREADY_STARTED',
  'UNIT_ALREADY_DONE',
  'DROP_NOT_READY',
  'DRIVER_REQUIRED',
  'DROP_DEPARTED',
  // billing
  'ORDER_INVOICED',
  'ALREADY_INVOICED',
  'CREDIT_EXCEEDS_BILLED',
  // companies / pricing
  'DOMAIN_TAKEN',
  'PUBLIC_DOMAIN',
  'EMAIL_DOMAIN_MISMATCH',
  'OWNER_NOT_EMPLOYEE',
  'TIER_CYCLE',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type IssuePath = (string | number)[];

export interface ErrorIssue {
  path: IssuePath;
  code: ErrorCode | string;
  message: string;
}

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    issues?: ErrorIssue[];
    details?: Record<string, unknown>;
  };
  requestId?: string;
}

export function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = (value as { error: unknown }).error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}
