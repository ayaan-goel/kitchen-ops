import type { NestExpressApplication } from '@nestjs/platform-express';
import type { DispatchBoardDto, DriverDayDto, DropDto, EmployeeMenuDto, MenuDishDto, OrderDetailDto } from '@fernleaf/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClockService } from '../../src/common/clock/clock.service';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { type Agent, bowlCombo, createTestApp, findDish, login, post } from './helpers';

/** Same pinned clock as the other suites: Mon 1 Mar 2027 12:00 IST. Today and 2027-03-02 are locked. */
const NOW = new Date('2027-03-01T06:30:00Z');
const TODAY = '2027-03-01';
const LOCKED_DATE = '2027-03-02';
/** A tiny PNG / non-image payload; only the leading bytes matter to the server's type check. */
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const TEXT = Buffer.from('definitely not an image');

describe('Dispatch and driver (integration)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let dispatch: Agent;
  let driver: Agent;
  let kitchen: Agent;
  let employeeId: string;
  let bowl: MenuDishDto;
  let driverId: string;
  let otherDriverId: string;

  /**
   * An admin's order for a locked date is confirmed at once and joins the drop for its
   * (company, address, time). Each test uses its own time so drops don't collide across suites.
   */
  const confirmedOrder = async (deliveryDate: string, deliveryTime: string): Promise<OrderDetailDto> => {
    const res = await post(admin, '/api/orders', {
      intent: 'PLACE',
      employeeId,
      deliveryDate,
      deliveryTime,
      lines: [{ dishId: bowl.id, quantity: 2, combinations: [bowlCombo(bowl, 2)] }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.order.status).toBe('CONFIRMED');
    return res.body.order as OrderDetailDto;
  };
  const dropOf = async (orderId: string) => (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).dropId!;
  const kitchenReady = async (orderId: string) => expect((await post(admin, `/api/orders/${orderId}/force-complete`, {})).status).toBe(200);
  const patchDriver = (agent: Agent, dropId: string, id: string | null) =>
    agent.patch(`/api/dispatch/drops/${dropId}/driver`).set('X-Requested-With', 'fetch').send({ driverId: id });
  const upload = (agent: Agent, dropId: string, data: Buffer, name = 'drop.png') =>
    agent.post(`/api/driver/drops/${dropId}/photo`).set('X-Requested-With', 'fetch').attach('file', data, { filename: name, contentType: 'image/png' });

  /** A drop for today that is dispatch-ready and assigned to driver@test.com. */
  const readyDropForDriver = async (time: string, assignTo = driverId): Promise<string> => {
    const order = await confirmedOrder(TODAY, time);
    await kitchenReady(order.id);
    const dropId = await dropOf(order.id);
    expect((await post(dispatch, `/api/dispatch/drops/${dropId}/dispatch-ready`, {})).status).toBe(200);
    expect((await patchDriver(dispatch, dropId, assignTo)).status).toBe(200);
    return dropId;
  };

  beforeAll(async () => {
    app = await createTestApp(NOW);
    prisma = app.get(PrismaService);
    [admin, dispatch, driver, kitchen] = await Promise.all([
      login(app, 'admin@test.com'),
      login(app, 'dispatch@test.com'),
      login(app, 'driver@test.com'),
      login(app, 'kitchen@test.com'),
    ]);
    const employee = await prisma.employee.findFirstOrThrow({
      where: { company: { name: 'Banyan Analytics' }, canChangeDeliveryTime: true },
      orderBy: { email: 'asc' },
    });
    employeeId = employee.id;
    const menu = (await admin.get(`/api/ordering/menu?employeeId=${employeeId}`)).body as EmployeeMenuDto;
    bowl = findDish(menu, 'FL-BWL-001');
    driverId = (await prisma.staffUser.findUniqueOrThrow({ where: { email: 'driver@test.com' } })).id;
    otherDriverId = (
      await prisma.staffUser.findFirstOrThrow({
        where: { email: { not: 'driver@test.com' }, isActive: true, role: { permissions: { has: 'deliveries.own' } } },
      })
    ).id;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('runs a drop end to end, enforcing the stage order and the driver rule (DSP-01, DSP-02)', async () => {
    const order = await confirmedOrder(LOCKED_DATE, '13:00');
    const dropId = await dropOf(order.id);

    const board = (await dispatch.get(`/api/dispatch/drops?date=${LOCKED_DATE}`)).body as DispatchBoardDto;
    const drop = board.drops.find((d) => d.id === dropId)!;
    expect(drop).toMatchObject({ stage: 'PENDING', totalOrders: 1, readyOrders: 0, boxes: 2, deliveryTime: '13:00' });

    // Not kitchen-ready yet → refused, with the reason.
    const early = await post(dispatch, `/api/dispatch/drops/${dropId}/dispatch-ready`, {});
    expect(early.status).toBe(422);
    expect(early.body.error.code).toBe('DROP_NOT_READY');
    // Skipping a stage is refused.
    expect((await post(dispatch, `/api/dispatch/drops/${dropId}/out-for-delivery`, {})).body.error.code).toBe('INVALID_TRANSITION');

    await kitchenReady(order.id);
    expect((await post(dispatch, `/api/dispatch/drops/${dropId}/dispatch-ready`, {})).status).toBe(200);
    const again = await post(dispatch, `/api/dispatch/drops/${dropId}/dispatch-ready`, {});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_TRANSITION');

    expect((await patchDriver(dispatch, dropId, null)).status).toBe(200);
    const noDriver = await post(dispatch, `/api/dispatch/drops/${dropId}/out-for-delivery`, {});
    expect(noDriver.status).toBe(422);
    expect(noDriver.body.error.code).toBe('DRIVER_REQUIRED');

    expect((await patchDriver(dispatch, dropId, otherDriverId)).status).toBe(200);
    const out = await post(dispatch, `/api/dispatch/drops/${dropId}/out-for-delivery`, {});
    expect(out.status).toBe(200);
    expect((out.body as DropDto).stage).toBe('OUT_FOR_DELIVERY');
    expect((await patchDriver(dispatch, dropId, driverId)).body.error.code).toBe('DROP_DEPARTED');

    const delivered = await post(dispatch, `/api/dispatch/drops/${dropId}/delivered`, { note: 'Left at reception' });
    expect(delivered.status).toBe(200);
    expect(delivered.body).toMatchObject({ stage: 'DELIVERED', deliveredOnTime: true, deliveryNote: 'Left at reception', deliveredBy: 'Deepak Verma' });
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.status).toBe('DELIVERED');
    expect(stored.deliveredAt).not.toBeNull();
    const events = await prisma.orderEvent.findMany({ where: { orderId: order.id }, select: { type: true } });
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['DISPATCH_READY', 'DRIVER_ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED']));
  });

  it('orders for the same company, address and time form one drop; readiness counts them (DSP-03, DSP-05)', async () => {
    const a = await confirmedOrder(LOCKED_DATE, '13:15');
    const b = await confirmedOrder(LOCKED_DATE, '13:15');
    expect(await dropOf(a.id)).toBe(await dropOf(b.id));
    await kitchenReady(a.id);
    const drop = (await dispatch.get(`/api/dispatch/drops/${await dropOf(a.id)}`)).body as DropDto;
    expect(drop).toMatchObject({ totalOrders: 2, readyOrders: 1, boxes: 4 });
    const res = await post(dispatch, `/api/dispatch/drops/${drop.id}/dispatch-ready`, {});
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/1 of 2 orders are kitchen-ready/);
  });

  it('two dispatchers advancing the same drop at once: exactly one succeeds', async () => {
    const order = await confirmedOrder(LOCKED_DATE, '13:30');
    await kitchenReady(order.id);
    const dropId = await dropOf(order.id);
    const second = await login(app, 'admin@test.com');
    const results = await Promise.all([
      post(dispatch, `/api/dispatch/drops/${dropId}/dispatch-ready`, {}),
      post(second, `/api/dispatch/drops/${dropId}/dispatch-ready`, {}),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.orderEvent.count({ where: { orderId: order.id, type: 'DISPATCH_READY' } })).toBe(1);
  });

  it('only people who can deliver are assignable; the driver list is permission-based (DSP-04)', async () => {
    const order = await confirmedOrder(LOCKED_DATE, '13:45');
    const dropId = await dropOf(order.id);
    const kitchenUser = await prisma.staffUser.findUniqueOrThrow({ where: { email: 'kitchen@test.com' } });
    const res = await patchDriver(dispatch, dropId, kitchenUser.id);
    expect(res.status).toBe(422);
    expect(res.body.error.issues[0].path).toEqual(['driverId']);
    const drivers = (await dispatch.get(`/api/dispatch/drivers?date=${LOCKED_DATE}`)).body as { id: string }[];
    expect(drivers.map((d) => d.id)).toContain(driverId);
    expect(drivers.map((d) => d.id)).not.toContain(kitchenUser.id);
  });

  it('a driver sees only their own drops for today and completes them with a note and photo (DSP-06, DSP-07)', async () => {
    const mine = await readyDropForDriver('14:00');
    const theirs = await readyDropForDriver('14:15', otherDriverId);
    const tomorrowOrder = await confirmedOrder(LOCKED_DATE, '14:00');
    const tomorrow = await dropOf(tomorrowOrder.id);
    expect((await patchDriver(dispatch, tomorrow, driverId)).status).toBe(200);

    const day = (await driver.get('/api/driver/drops')).body as DriverDayDto;
    expect(day.date).toBe(TODAY);
    const ids = day.drops.map((d) => d.id);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(theirs);
    expect(ids).not.toContain(tomorrow);

    // Someone else's drop, or my drop on another day: indistinguishable from a missing one.
    expect((await post(driver, `/api/driver/drops/${theirs}/picked-up`, {})).status).toBe(404);
    expect((await post(driver, `/api/driver/drops/${tomorrow}/picked-up`, {})).status).toBe(404);
    expect((await upload(driver, theirs, PNG)).status).toBe(404);

    expect((await post(driver, `/api/driver/drops/${mine}/picked-up`, {})).status).toBe(200);
    const bad = await upload(driver, mine, TEXT, 'note.png');
    expect(bad.status).toBe(422);
    const photo = await upload(driver, mine, PNG);
    expect(photo.status).toBe(201);
    const photoId = photo.body.photoId as string;

    const done = await post(driver, `/api/driver/drops/${mine}/delivered`, { note: 'Handed to security', photoId });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ stage: 'DELIVERED', photoId, deliveredOnTime: true, deliveredBy: 'Dev Malhotra' });
    const twice = await post(driver, `/api/driver/drops/${mine}/delivered`, {});
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('INVALID_TRANSITION');

    // The photo: visible to the driver and dispatch, a 404 for anyone else.
    const asDriver = await driver.get(`/api/files/${photoId}`);
    expect(asDriver.status).toBe(200);
    expect(asDriver.headers['content-type']).toBe('image/png');
    expect((await dispatch.get(`/api/files/${photoId}`)).status).toBe(200);
    expect((await kitchen.get(`/api/files/${photoId}`)).status).toBe(404);
  });

  it('records a late delivery as not on time (DSP-09, A-29)', async () => {
    const dropId = await readyDropForDriver('12:30');
    expect((await post(driver, `/api/driver/drops/${dropId}/picked-up`, {})).status).toBe(200);
    const clock = app.get(ClockService);
    clock.setFixedNow(new Date('2027-03-01T07:30:00Z')); // 13:00 IST, half an hour late
    try {
      const res = await post(driver, `/api/driver/drops/${dropId}/delivered`, {});
      expect(res.status).toBe(200);
      expect(res.body.deliveredOnTime).toBe(false);
    } finally {
      clock.setFixedNow(NOW);
    }
  });

  it('a photo can only be attached by the person who uploaded it', async () => {
    const mine = await readyDropForDriver('14:30');
    expect((await post(driver, `/api/driver/drops/${mine}/picked-up`, {})).status).toBe(200);
    const photoId = (await upload(driver, mine, PNG)).body.photoId as string;
    const other = await readyDropForDriver('14:45');
    expect((await post(dispatch, `/api/dispatch/drops/${other}/out-for-delivery`, {})).status).toBe(200);
    const res = await post(dispatch, `/api/dispatch/drops/${other}/delivered`, { photoId });
    expect(res.status).toBe(422);
  });

  it('drivers cannot use the dispatch board, and the kitchen cannot advance drops', async () => {
    expect((await driver.get(`/api/dispatch/drops?date=${TODAY}`)).status).toBe(403);
    const order = await confirmedOrder(LOCKED_DATE, '15:00');
    await kitchenReady(order.id);
    expect((await post(kitchen, `/api/dispatch/drops/${await dropOf(order.id)}/dispatch-ready`, {})).status).toBe(403);
    expect((await kitchen.get('/api/driver/drops')).status).toBe(403);
  });
});
