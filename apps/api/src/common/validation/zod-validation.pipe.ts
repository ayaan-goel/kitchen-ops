import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ValidationFailed } from '../errors/domain-error';

/**
 * Validates a body / query / param with a shared Zod schema and returns the parsed value.
 * Usage: `@Body(new ZodValidationPipe(loginSchema)) body: LoginInput`
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new ValidationFailed(
      'Some fields need attention.',
      result.error.issues.map((issue) => ({
        path: issue.path.filter((p): p is string | number => typeof p !== 'symbol'),
        code: issue.code,
        message: issue.message,
      })),
    );
  }
}
