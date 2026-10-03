import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClockService } from '../../src/common/clock/clock.service';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { DemoService } from '../../src/modules/demo/demo.service';
import { createTestApp } from './helpers';

/**
 * Rolling demo data. A June 2027 clock keeps these dates clear of the other suites (March 2027),
 * since drops are keyed by date. Wed 2 Jun 2027 13:30 IST.
 */
const NOW = new Date('2027-06-02T08:00:00Z');
const TODAY = '2027-06-02';
const between = (from: string, to: string) => ({ gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) });

describe('Demo data generator and autopilot (integration)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let demo: DemoService;
  let clock: ClockService;
  const window = between('2027-05-19', '2027-06-09');

  beforeAll(async () => {
    app = await createTestApp(NOW);
    prisma = app.get(PrismaService);
    demo = app.get(DemoService);
    clock = app.get(ClockService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('fills two weeks back and a week ahead with every status, a busy Wednesday and driver work today', { timeout: 600_000 }, async () => {
    const summary = await demo.ensure();
    expect(summary.generatedDates).toHaveLength(22);
    expect(summary.ordersCreated).toBeGreaterThan(1500);
    expect(summary.invoicesCreated).toBeGreaterThan(0);

    const statuses = await prisma.order.groupBy({ by: ['status'], where: { deliveryDate: window, createdById: null }, _count: { _all: true } });
    expect(statuses.map((s) => s.status).sort()).toEqual(['CANCELLED', 'CONFIRMED', 'DELIVERED', 'DRAFT', 'PLACED', 'REJECTED']);

    // Past dates are finished; nothing confirmed is left behind.
    expect(await prisma.order.count({ where: { deliveryDate: between('2027-05-19', '2027-06-01'), status: { in: ['CONFIRMED', 'PLACED', 'DRAFT'] }, createdById: null } })).toBe(0);
    // Wednesday is the big day (KIT-12).
    expect(await prisma.order.count({ where: { deliveryDate: new Date(`${TODAY}T00:00:00Z`), status: { in: ['CONFIRMED', 'DELIVERED'] } } })).toBeGreaterThan(300);
    // Today's kitchen is part-way through, and the test driver has drops to act on.
    const units = await prisma.orderLineCombination.groupBy({
      by: ['kitchenDoneAt'],
      where: { orderLine: { order: { deliveryDate: new Date(`${TODAY}T00:00:00Z`), status: 'CONFIRMED' } } },
      _count: { _all: true },
    });
    expect(units.some((u) => u.kitchenDoneAt === null)).toBe(true);
    const driver = await prisma.staffUser.findUniqueOrThrow({ where: { email: 'driver@test.com' } });
    expect(await prisma.drop.count({ where: { deliveryDate: new Date(`${TODAY}T00:00:00Z`), driverId: driver.id } })).toBeGreaterThan(0);
    // Delivered history has on-time and late deliveries, and invoices are reconciled.
    expect(await prisma.drop.count({ where: { deliveryDate: window, deliveredOnTime: false } })).toBeGreaterThan(0);
    const invoices = await prisma.invoice.findMany({ include: { lines: true } });
    for (const inv of invoices) expect(inv.totalCents).toBe(inv.lines.reduce((s, l) => s + l.amountCents, 0));
  });

  it('is idempotent: a second run on the same day creates and moves nothing', { timeout: 300_000 }, async () => {
    const before = await prisma.order.groupBy({ by: ['status'], where: { deliveryDate: window }, _count: { _all: true } });
    const summary = await demo.ensure();
    expect(summary).toMatchObject({ generatedDates: [], ordersCreated: 0, invoicesCreated: 0 });
    const after = await prisma.order.groupBy({ by: ['status'], where: { deliveryDate: window }, _count: { _all: true } });
    expect(after).toEqual(before);
  });

  it('the next day adds exactly one new date and completes yesterday', { timeout: 300_000 }, async () => {
    clock.setFixedNow(new Date('2027-06-03T08:00:00Z'));
    try {
      const summary = await demo.ensure();
      expect(summary.generatedDates).toEqual(['2027-06-10']);
      expect(await prisma.order.count({ where: { deliveryDate: new Date(`${TODAY}T00:00:00Z`), status: 'CONFIRMED', createdById: null } })).toBe(0);
    } finally {
      clock.setFixedNow(NOW);
    }
  });
});
