import { describe, expect, it } from 'vitest';
import { DOMAIN_PACKAGE } from './index';

describe('domain package', () => {
  it('loads', () => {
    expect(DOMAIN_PACKAGE).toBe('@fernleaf/domain');
  });
});
