import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { ErrorCode, ErrorEnvelope } from '@fernleaf/shared';
import type { Request, Response } from 'express';
import { DomainError } from './domain-error';

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT_STALE',
  429: 'RATE_LIMITED',
};

interface PrismaKnownError {
  code: string;
  meta?: Record<string, unknown>;
}

function isPrismaKnownError(err: unknown): err is PrismaKnownError & Error {
  return (
    err instanceof Error &&
    err.name === 'PrismaClientKnownRequestError' &&
    typeof (err as { code?: unknown }).code === 'string'
  );
}

/** Turns every error into the shared envelope `{ error: { code, message, issues? }, requestId }`. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    const { status, body } = this.toEnvelope(exception);
    body.requestId = typeof req.id === 'string' ? req.id : undefined;

    if (status >= 500) {
      this.logger.error({ err: exception, requestId: body.requestId }, 'Unhandled error');
    }
    res.status(status).json(body);
  }

  private toEnvelope(exception: unknown): { status: number; body: ErrorEnvelope } {
    if (exception instanceof DomainError) {
      return {
        status: exception.status,
        body: {
          error: {
            code: exception.code,
            message: exception.message,
            ...(exception.issues ? { issues: exception.issues } : {}),
            ...(exception.details ? { details: exception.details } : {}),
          },
        },
      };
    }

    if (isPrismaKnownError(exception)) {
      if (exception.code === 'P2002') {
        return {
          status: 409,
          body: { error: { code: 'CONFLICT_STALE', message: 'This conflicts with an existing record.' } },
        };
      }
      if (exception.code === 'P2025') {
        return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Not found' } } };
      }
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : typeof (response as { message?: unknown }).message === 'string'
            ? (response as { message: string }).message
            : exception.message;
      return {
        status,
        body: { error: { code: STATUS_TO_CODE[status] ?? 'INTERNAL', message } },
      };
    }

    return {
      status: 500,
      body: { error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } },
    };
  }
}
