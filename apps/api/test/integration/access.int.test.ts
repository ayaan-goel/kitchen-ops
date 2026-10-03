import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Agent, createTestApp, login } from './helpers';

const NOW = new Date('2027-03-01T06:30:00Z');
type Role = 'admin' | 'kitchen' | 'dispatch' | 'driver';

/**
 * Access matrix (ACC-03, PLT-05, NFR-08): every role against representative endpoints. Reads only,
 * so the expected status is purely about permissions. 200 = allowed, 403 = forbidden.
 */
const MATRIX: [string, Record<Role, number>][] = [
  ['/api/orders', { admin: 200, kitchen: 200, dispatch: 200, driver: 403 }],
  ['/api/kitchen/board', { admin: 200, kitchen: 200, dispatch: 200, driver: 403 }],
  ['/api/dispatch/drops', { admin: 200, kitchen: 403, dispatch: 200, driver: 403 }],
  ['/api/driver/drops', { admin: 403, kitchen: 403, dispatch: 403, driver: 200 }],
  ['/api/billing/companies', { admin: 200, kitchen: 403, dispatch: 403, driver: 403 }],
  ['/api/price-tiers', { admin: 200, kitchen: 403, dispatch: 403, driver: 403 }],
  ['/api/dishes', { admin: 200, kitchen: 200, dispatch: 403, driver: 403 }],
  ['/api/companies', { admin: 200, kitchen: 403, dispatch: 200, driver: 403 }],
  ['/api/employees', { admin: 200, kitchen: 403, dispatch: 403, driver: 403 }],
  ['/api/staff', { admin: 200, kitchen: 403, dispatch: 403, driver: 403 }],
  ['/api/settings', { admin: 200, kitchen: 403, dispatch: 403, driver: 403 }],
  ['/api/cutoffs', { admin: 200, kitchen: 403, dispatch: 403, driver: 403 }],
  ['/api/admin/demo', { admin: 200, kitchen: 403, dispatch: 403, driver: 403 }],
];

describe('Access matrix (integration)', () => {
  let app: NestExpressApplication;
  const agents = {} as Record<Role, Agent>;

  beforeAll(async () => {
    app = await createTestApp(NOW);
    for (const role of ['admin', 'kitchen', 'dispatch', 'driver'] as Role[]) agents[role] = await login(app, `${role}@test.com`);
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(MATRIX)('%s', async (path, expected) => {
    const actual = Object.fromEntries(await Promise.all((Object.keys(expected) as Role[]).map(async (role) => [role, (await agents[role].get(path)).status])));
    expect(actual).toEqual(expected);
  });

  it('anonymous requests are 401 everywhere except health', async () => {
    const anon = (await import('supertest')).default(app.getHttpServer());
    expect((await anon.get('/api/orders')).status).toBe(401);
    expect((await anon.get('/api/dashboard')).status).toBe(401);
    expect((await anon.get('/api/health/live')).status).toBe(200);
  });

  it('each role lands on its own dashboard, chosen by role data (ACC-05)', async () => {
    const kinds = await Promise.all((['admin', 'kitchen', 'dispatch', 'driver'] as Role[]).map(async (role) => (await agents[role].get('/api/dashboard')).body.kind));
    expect(kinds).toEqual(['ADMIN', 'KITCHEN', 'DISPATCH', 'DRIVER']);
  });

  it('mutations without the CSRF header are refused', async () => {
    const res = await agents.admin.post('/api/orders').send({});
    expect(res.status).toBe(403);
  });
});
