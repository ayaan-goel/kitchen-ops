import type { ErrorCode, ErrorIssue } from '@fernleaf/shared';

/**
 * Typed errors thrown by services; the global exception filter turns them into the
 * shared error envelope (TRD §4.5).
 */
export class DomainError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly issues?: ErrorIssue[],
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 400 — input shape is wrong. */
export class ValidationFailed extends DomainError {
  constructor(message: string, issues: ErrorIssue[]) {
    super(400, 'VALIDATION_FAILED', message, issues);
  }
}

/** 422 — input is well-formed but breaks a business rule. */
export class RuleViolation extends DomainError {
  constructor(code: ErrorCode, message: string, issues?: ErrorIssue[], details?: Record<string, unknown>) {
    super(422, code, message, issues, details);
  }
}

/** 409 — state or concurrency conflict (someone else got there first). */
export class StateConflict extends DomainError {
  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(409, code, message, undefined, details);
  }
}

export class NotFound extends DomainError {
  constructor(message = 'Not found') {
    super(404, 'NOT_FOUND', message);
  }
}

export class Forbidden extends DomainError {
  constructor(message = 'Your role does not allow this action') {
    super(403, 'FORBIDDEN', message);
  }
}

export class Unauthenticated extends DomainError {
  constructor(message = 'Please sign in') {
    super(401, 'UNAUTHENTICATED', message);
  }
}
