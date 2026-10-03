import { loginSchema } from '@fernleaf/shared';
import { describe, expect, it } from 'vitest';
import { ValidationFailed } from '../src/common/errors/domain-error';
import { ZodValidationPipe } from '../src/common/validation/zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(loginSchema);

  it('returns the parsed value (normalising the email)', () => {
    expect(pipe.transform({ email: ' Admin@Test.com ', password: 'x' })).toEqual({
      email: 'admin@test.com',
      password: 'x',
    });
  });

  it('throws VALIDATION_FAILED with field paths', () => {
    try {
      pipe.transform({ email: 'nope', password: '' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationFailed);
      const issues = (err as ValidationFailed).issues ?? [];
      expect(issues.map((i) => i.path.join('.'))).toEqual(['email', 'password']);
    }
  });
});
