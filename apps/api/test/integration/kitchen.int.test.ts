import type { NestExpressApplication } from '@nestjs/platform-express';
import type { EmployeeMenuDto, KitchenBoardDto, MenuDishDto, OrderDetailDto } from '@fernleaf/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { type Agent, bowlCombo, createTestApp, findDish, login, post } from './helpers';

/** Same pinned clock as orders.int.test.ts: Mon 1 Mar 2027 12:00 IST; 2027-03-02 is locked. */
const NOW = new Date('2027-03-01T06:30:00Z');
const LOCKED_DATE = '2027-03-02';

describe('Kitchen board (integration)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let kitchen: Agent;
  let employeeId: string;
  let bowl: MenuDishDto;

  /** An admin's late order for a locked date is confirmed straight away → workable in the kitchen. */
  const confirmedOrder = async (): Promise<OrderDetailDto> => {
    const res = await post(admin, '/api/orders', {
      intent: 'PLACE',
      employeeId,
      deliveryDate: LOCKED_DATE,
      lines: [{ dishId: bowl.id, quantity: 5, combinations: [bowlCombo(bowl, 3, 'Brown rice'), bowlCombo(bowl, 2)] }],
    });
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe('CONFIRMED');
    return res.body.order as OrderDetailDto;
  };
  const unitIds = (order: OrderDetailDto) => order.lines.flatMap((l) => l.combinations.map((c) => c.id));

  beforeAll(async () => {
    app = await createTestApp(NOW);
    prisma = app.get(PrismaService);
    admin = await login(app, 'admin@test.com');
    kitchen = await login(app, 'kitchen@test.com');
    const employee = await prisma.employee.findFirstOrThrow({
      where: { company: { name: 'Banyan Analytics' }, canChangeDeliveryTime: false },
      orderBy: { email: 'desc' },
    });
    employeeId = employee.id;
    const menu = (await admin.get(`/api/ordering/menu?employeeId=${employeeId}`)).body as EmployeeMenuDto;
    bowl = findDish(menu, 'FL-BWL-001');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('shows one prep unit per combination, routed to the dish station, with planned time and risk', async () => {
    const order = await confirmedOrder();
    const res = await kitchen.get(`/api/kitchen/board?date=${LOCKED_DATE}`);
    expect(res.status).toBe(200);
    const board = res.body as KitchenBoardDto;
    const mine = board.units.filter((u) => u.orderId === order.id);
    expect(mine.map((u) => u.quantity).sort()).toEqual([2, 3]);
    expect(mine[0]).toMatchObject({ dishName: 'Paneer Tikka Rice Bowl', status: 'NOT_STARTED', risk: 'OK', allergens: ['Dairy'] });
    expect(board.stations.find((s) => s.name === 'Curry & Rice')?.units).toBeGreaterThanOrEqual(2);
  });

  it('finishing a unit that was never started also records the start (KIT-06)', async () => {
    const order = await confirmedOrder();
    const [unit] = unitIds(order);
    const res = await post(kitchen, `/api/kitchen/units/${unit}/done`, {});
    expect(res.status).toBe(200);
    expect(res.body.unit.status).toBe('DONE');
    expect(res.body.unit.startedAt).toBe(res.body.unit.doneAt);
    expect(res.body.order.kitchenStartedAt).not.toBeNull();
    expect(res.body.order.kitchenReadyAt).toBeNull(); // the other unit is still to do
  });

  it('two cooks marking the same unit done at once: exactly one succeeds (KIT-05, NFR-03)', async () => {
    const order = await confirmedOrder();
    const [unit] = unitIds(order);
    const other = await login(app, 'kitchen@test.com');
    const results = await Promise.all([post(kitchen, `/api/kitchen/units/${unit}/done`, {}), post(other, `/api/kitchen/units/${unit}/done`, {})]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const loser = results.find((r) => r.status === 409)!;
    expect(loser.body.error.code).toBe('UNIT_ALREADY_DONE');
    expect(loser.body.error.message).toMatch(/Already marked done by Kiran Shetty/);
  });

  it('a unit cannot be started twice', async () => {
    const order = await confirmedOrder();
    const [unit] = unitIds(order);
    expect((await post(kitchen, `/api/kitchen/units/${unit}/start`, {})).status).toBe(200);
    const again = await post(kitchen, `/api/kitchen/units/${unit}/start`, {});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('UNIT_ALREADY_STARTED');
  });

  it('when the last two units finish concurrently, kitchen-ready is set exactly once (KIT-07)', async () => {
    const order = await confirmedOrder();
    const [a, b] = unitIds(order);
    const results = await Promise.all([post(kitchen, `/api/kitchen/units/${a}/done`, {}), post(admin, `/api/kitchen/units/${b}/done`, {})]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.kitchenReadyAt).not.toBeNull();
    expect(await prisma.orderEvent.count({ where: { orderId: order.id, type: 'KITCHEN_READY' } })).toBe(1);
    expect(await prisma.orderEvent.count({ where: { orderId: order.id, type: 'KITCHEN_STARTED' } })).toBe(1);
  });

  it('only confirmed orders can be worked on (KIT-04)', async () => {
    const placed = await post(admin, '/api/orders', {
      intent: 'PLACE',
      employeeId,
      deliveryDate: '2027-03-04',
      lines: [{ dishId: bowl.id, quantity: 1, combinations: [bowlCombo(bowl, 1)] }],
    });
    expect(placed.body.order.status).toBe('PLACED');
    const unit = unitIds(placed.body.order as OrderDetailDto)[0];
    const res = await post(kitchen, `/api/kitchen/units/${unit}/start`, {});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ORDER_NOT_CONFIRMED');
  });

  it('an admin can force-complete a whole order; the kitchen role cannot (KIT-11)', async () => {
    const order = await confirmedOrder();
    expect((await post(kitchen, `/api/orders/${order.id}/force-complete`, {})).status).toBe(403);
    const res = await post(admin, `/api/orders/${order.id}/force-complete`, {});
    expect(res.status).toBe(200);
    expect(res.body.kitchenReadyAt).not.toBeNull();
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.kitchenForced).toBe(true);
    expect(await prisma.orderLineCombination.count({ where: { orderLine: { orderId: order.id }, kitchenDoneAt: null } })).toBe(0);
  });

  it('dispatch can read the board but not work it; drivers cannot read it', async () => {
    const dispatch = await login(app, 'dispatch@test.com');
    const driver = await login(app, 'driver@test.com');
    expect((await dispatch.get(`/api/kitchen/board?date=${LOCKED_DATE}`)).status).toBe(200);
    const order = await confirmedOrder();
    expect((await post(dispatch, `/api/kitchen/units/${unitIds(order)[0]}/start`, {})).status).toBe(403);
    expect((await driver.get(`/api/kitchen/board?date=${LOCKED_DATE}`)).status).toBe(403);
  });
});
