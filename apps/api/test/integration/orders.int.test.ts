import type { NestExpressApplication } from '@nestjs/platform-express';
import type { EmployeeMenuDto, MenuDishDto } from '@fernleaf/shared';
import { hash } from '@node-rs/argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { MenuCatalogueService } from '../../src/modules/ordering/menu-catalogue.service';
import { type Agent, bowlCombo, createTestApp, findDish, login, post, put } from './helpers';

/**
 * Orders through real HTTP + Postgres (schema fl_test). The clock is pinned to
 * Mon 1 Mar 2027 12:00 IST; the seeded kitchen cooks 7 days, cut-off is 2 days before at 16:00.
 *   2027-03-02 (Tue) → cut-off Sun 28 Feb 16:00 → LOCKED
 *   2027-03-04 (Thu) → cut-off Tue 2 Mar 16:00  → open
 *   2027-03-05 (Fri) → cut-off Wed 3 Mar 16:00  → open
 *   2027-03-06 (Sat) → Banyan works Mon–Fri     → not deliverable
 */
const NOW = new Date('2027-03-01T06:30:00Z');

describe('Orders API (integration)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let clerk: Agent;
  let employeeId: string;
  let bowl: MenuDishDto;

  const order = (deliveryDate: string, combos: ReturnType<typeof bowlCombo>[], intent: 'DRAFT' | 'PLACE' = 'PLACE') => ({
    intent,
    employeeId,
    deliveryDate,
    lines: [{ dishId: bowl.id, quantity: combos.reduce((s, c) => s + c.quantity, 0), combinations: combos }],
  });

  beforeAll(async () => {
    app = await createTestApp(NOW);
    prisma = app.get(PrismaService);

    // A role that can order but cannot override — created as data, no code change (ACC-04).
    const role = await prisma.role.create({
      data: { key: 'TEST_CLERK', name: 'Ordering clerk', permissions: ['dashboard.view', 'orders.read', 'orders.write'], dashboard: 'ADMIN' },
    });
    await prisma.staffUser.create({
      data: { email: 'clerk@test.local', name: 'Test Clerk', roleId: role.id, passwordHash: await hash('Test@1234') },
    });

    admin = await login(app, 'admin@test.com');
    clerk = await login(app, 'clerk@test.local');

    const employee = await prisma.employee.findFirstOrThrow({
      where: { company: { name: 'Banyan Analytics' }, canChangeDeliveryTime: false },
      orderBy: { email: 'asc' },
    });
    employeeId = employee.id;
    const menu = (await admin.get(`/api/ordering/menu?employeeId=${employeeId}`)).body as EmployeeMenuDto;
    bowl = findDish(menu, 'FL-BWL-001');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('prices the brief’s example on the server: 6 brown + 4 jeera = $75.40', async () => {
    const res = await post(admin, '/api/orders/quote', order('2027-03-05', [bowlCombo(bowl, 6, 'Brown rice'), bowlCombo(bowl, 4)]));
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.totalCents).toBe(7540);
  });

  it('rejects rule violations sent straight to the API, with field paths (ORD-02)', async () => {
    const tenBowls = order('2027-03-05', [bowlCombo(bowl, 6, 'Brown rice'), bowlCombo(bowl, 3)]);
    tenBowls.lines[0]!.quantity = 10; // 6 + 3 combinations do not add up to 10
    const mismatch = await post(admin, '/api/orders', tenBowls);
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.error.issues).toContainEqual(
      expect.objectContaining({ code: 'COMBINATION_QTY_MISMATCH', path: ['lines', 0, 'combinations'] }),
    );

    const missingRequired = order('2027-03-05', [{ ...bowlCombo(bowl, 1), selections: bowlCombo(bowl, 1).selections.slice(1) }]);
    const res = await post(admin, '/api/orders', missingRequired);
    expect(res.status).toBe(422);
    expect(res.body.error.issues[0]).toMatchObject({ code: 'REQUIRED_GROUP_MISSING' });

    const weekend = await post(admin, '/api/orders', order('2027-03-06', [bowlCombo(bowl, 1)]));
    expect(weekend.status).toBe(422);
    expect(weekend.body.error.code).toBe('DATE_NOT_DELIVERABLE');

    const otherTime = await post(admin, '/api/orders', { ...order('2027-03-05', [bowlCombo(bowl, 1)]), deliveryTime: '14:00' });
    expect(otherTime.status).toBe(422);
    expect(otherTime.body.error.code).toBe('DELIVERY_OPTION_NOT_ALLOWED');
  });

  it('blocks non-admins after the cut-off; an admin’s late order is confirmed and put in a drop (A-07)', async () => {
    const staff = await post(clerk, '/api/orders', order('2027-03-02', [bowlCombo(bowl, 1)]));
    expect(staff.status).toBe(422);
    expect(staff.body.error.code).toBe('CUTOFF_PASSED');

    const late = await post(admin, '/api/orders', order('2027-03-02', [bowlCombo(bowl, 2)]));
    expect(late.status).toBe(201);
    expect(late.body.order.status).toBe('CONFIRMED');
    expect(late.body.order.drop).toMatchObject({ stage: 'PENDING', driverName: 'Dev Malhotra' });
  });

  it('cut-off processing confirms placed orders, cancels drafts, and is safe to run twice (CUT-03, CUT-04)', async () => {
    const placed = await post(clerk, '/api/orders', order('2027-03-05', [bowlCombo(bowl, 3)]));
    const draft = await post(clerk, '/api/orders', order('2027-03-05', [bowlCombo(bowl, 1)], 'DRAFT'));
    expect([placed.status, draft.status]).toEqual([201, 201]);
    expect(draft.body.order.status).toBe('DRAFT');

    const notYet = await post(admin, '/api/cutoffs/2027-03-05/run', {});
    expect(notYet.status).toBe(422); // cut-off is in the future: needs an explicit "close early"

    const first = await post(admin, '/api/cutoffs/2027-03-05/run', { closeEarly: true });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ confirmed: 1, cancelled: 1, runCount: 1 });

    const second = await post(admin, '/api/cutoffs/2027-03-05/run', { closeEarly: true });
    expect(second.body).toMatchObject({ confirmed: 0, cancelled: 0, runCount: 2 });

    const [p, d] = await Promise.all([
      admin.get(`/api/orders/${placed.body.order.id}`),
      admin.get(`/api/orders/${draft.body.order.id}`),
    ]);
    expect(p.body.status).toBe('CONFIRMED');
    expect(d.body).toMatchObject({ status: 'CANCELLED', statusReason: 'Auto-cancelled at cut-off' });

    // The date is now locked for staff even though its cut-off instant is still in the future.
    const after = await post(clerk, '/api/orders', order('2027-03-05', [bowlCombo(bowl, 1)]));
    expect(after.body.error.code).toBe('CUTOFF_PASSED');
  });

  it('a price change affects new orders only (PRICE-08, CAT-12)', async () => {
    const created = await post(clerk, '/api/orders', order('2027-03-04', [bowlCombo(bowl, 2)]));
    expect(created.status).toBe(201);
    const totalBefore = created.body.order.totalCents as number;

    const standard = await prisma.priceTier.findUniqueOrThrow({ where: { name: 'Standard' } });
    const where = { tierId_dishId: { tierId: standard.id, dishId: bowl.id } };
    const original = await prisma.dishPrice.findUniqueOrThrow({ where });
    try {
      await prisma.dishPrice.update({ where, data: { priceCents: original.priceCents + 100 } });
      app.get(MenuCatalogueService).invalidate();

      const stored = await admin.get(`/api/orders/${created.body.order.id}`);
      expect(stored.body.totalCents).toBe(totalBefore);
      expect(stored.body.lines[0].dishUnitPriceCents).toBe(original.priceCents);

      const quote = await post(admin, '/api/orders/quote', order('2027-03-04', [bowlCombo(bowl, 2)]));
      expect(quote.body.totalCents).toBe(totalBefore + 200);
    } finally {
      await prisma.dishPrice.update({ where, data: { priceCents: original.priceCents } });
      app.get(MenuCatalogueService).invalidate();
    }
  });

  it('rejects a stale edit (optimistic concurrency, NFR-03)', async () => {
    const created = await post(clerk, '/api/orders', order('2027-03-04', [bowlCombo(bowl, 1)], 'DRAFT'));
    const { id, version } = created.body.order as { id: string; version: number };
    const body = { version, deliveryDate: '2027-03-04', notes: 'first edit', lines: order('2027-03-04', [bowlCombo(bowl, 1)]).lines };

    expect((await put(clerk, `/api/orders/${id}`, body)).status).toBe(200);
    const stale = await put(clerk, `/api/orders/${id}`, { ...body, notes: 'second edit, old version' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('CONFLICT_STALE');
  });

  it('two people cancelling the same order at once: exactly one succeeds', async () => {
    const created = await post(clerk, '/api/orders', order('2027-03-04', [bowlCombo(bowl, 1)]));
    const id = created.body.order.id as string;
    const results = await Promise.all([
      post(clerk, `/api/orders/${id}/cancel`, { reason: 'duplicate request A' }),
      post(admin, `/api/orders/${id}/cancel`, { reason: 'duplicate request B' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const events = await prisma.orderEvent.count({ where: { orderId: id, type: 'CANCELLED' } });
    expect(events).toBe(1);
  });

  it('only lets roles with the permission create orders (kitchen → 403)', async () => {
    const kitchen = await login(app, 'kitchen@test.com');
    const res = await post(kitchen, '/api/orders', order('2027-03-04', [bowlCombo(bowl, 1)]));
    expect(res.status).toBe(403);
  });
});
