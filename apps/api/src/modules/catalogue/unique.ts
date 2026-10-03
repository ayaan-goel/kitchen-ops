import { RuleViolation } from '../../common/errors/domain-error';

/** Runs a write and turns a unique-constraint clash into a friendly 422 on `name` (or `field`). */
export async function uniqueName<T>(write: () => Promise<T>, value: string, field = 'name'): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (err instanceof Error && err.name === 'PrismaClientKnownRequestError' && (err as { code?: string }).code === 'P2002') {
      const message = `“${value}” is already taken.`;
      throw new RuleViolation('VALIDATION_FAILED', message, [{ path: [field], code: 'VALIDATION_FAILED', message }]);
    }
    throw err;
  }
}
