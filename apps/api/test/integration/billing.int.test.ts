import type { NestExpressApplication } from '@nestjs/platform-express';
import type { BillingCompanyDto, CompanyBillableDto, EmployeeMenuDto, InvoiceDetailDto, MenuDishDto, OrderDetailDto } from '@fernleaf/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { type Agent, bowlCombo, createTestApp, findDish, login, post, put } from './helpers';

/** Same pinned clock as the other suites: Mon 1 Mar 2027 12:00 IST; 2027-03-02 is locked. */
const NOW = new Date('2027-03-01T06:30:00Z');
const LOCKED_DATE = '2027-03-02';
/** A company no other suite orders for, so its billing figures are this suite's alone. */
const COMPANY = 'Orbit Support Services';

describe('Billing (integration)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let companyId: string;
  let employeeId: string;
  let bowl: MenuDishDto;

  const confirmedOrder = async (quantity = 2): Promise<OrderDetailDto> => {
    const res = await post(admin, '/api/orders', {
      intent: 'PLACE',
      employeeId,
      deliveryDate: LOCKED_DATE,
      lines: [{ dishId: bowl.id, quantity, combinations: [bowlCombo(bowl, quantity)] }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.order.status).toBe('CONFIRMED');
    return res.body.order as OrderDetailDto;
  };
  const invoice = (orderIds: string[], adjustmentIds: string[] = [], agent = admin) =>
    post(agent, '/api/billing/invoices', { companyId, orderIds, adjustmentIds });
  const pendingFor = async (orderId: string) =>
    ((await admin.get(`/api/billing/companies/${companyId}/billable`)).body as CompanyBillableDto).adjustments.filter((a) => a.orderId === orderId);
  /** Everything the company has been or will be charged for one order (invoice line + all adjustments). */
  const netCharge = async (orderId: string) => {
    const line = await prisma.invoiceLine.findUnique({ where: { orderId } });
    const adjustments = await prisma.billingAdjustment.findMany({ where: { orderId } });
    return (line?.amountCents ?? 0) + adjustments.reduce((s, a) => s + a.amountCents, 0);
  };

  beforeAll(async () => {
    app = await createTestApp(NOW);
    prisma = app.get(PrismaService);
    admin = await login(app, 'admin@test.com');
    const company = await prisma.company.findUniqueOrThrow({ where: { name: COMPANY } });
    companyId = company.id;
    const employee = await prisma.employee.findFirstOrThrow({ where: { companyId }, orderBy: { email: 'asc' } });
    employeeId = employee.id;
    const menu = (await admin.get(`/api/ordering/menu?employeeId=${employeeId}`)).body as EmployeeMenuDto;
    bowl = findDish(menu, 'FL-BWL-001');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('invoices selected orders: amounts are snapshotted and the total is the sum of its lines (BIL-02, BIL-03, NFR-01)', async () => {
    const a = await confirmedOrder(2);
    const b = await confirmedOrder(3);
    const before = (await admin.get(`/api/billing/companies/${companyId}/billable`)).body as CompanyBillableDto;
    expect(before.orders.map((o) => o.id)).toEqual(expect.arrayContaining([a.id, b.id]));

    const res = await invoice([a.id, b.id]);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const inv = res.body as InvoiceDetailDto;
    expect(inv.status).toBe('ISSUED');
    expect(inv.lines).toHaveLength(2);
    expect(inv.totalCents).toBe(a.totalCents + b.totalCents);
    expect(inv.linesSumCents).toBe(inv.totalCents);
    expect(inv.billTo.companyName).toBe(COMPANY);
    expect(inv.periodStart).toBe(LOCKED_DATE);

    const after = (await admin.get(`/api/billing/companies/${companyId}/billable`)).body as CompanyBillableDto;
    expect(after.orders.map((o) => o.id)).not.toContain(a.id);
    const detail = (await admin.get(`/api/orders/${a.id}`)).body as OrderDetailDto;
    expect(detail.invoice?.number).toBe(inv.number);
    expect(await prisma.orderEvent.count({ where: { orderId: a.id, type: 'INVOICED' } })).toBe(1);

    const overview = ((await admin.get('/api/billing/companies')).body as BillingCompanyDto[]).find((c) => c.id === companyId)!;
    expect(overview.outstandingInvoices).toBeGreaterThanOrEqual(1);
    expect(overview.outstandingCents).toBeGreaterThanOrEqual(inv.totalCents);
  });

  it('two invoices racing for the same order: exactly one wins (BIL-05)', async () => {
    const order = await confirmedOrder();
    const second = await login(app, 'admin@test.com');
    const results = await Promise.all([invoice([order.id]), invoice([order.id], [], second)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe('ALREADY_INVOICED');
    expect(await prisma.invoiceLine.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('cancelling an invoiced order creates a credit, billed on the next invoice, that nets the order to zero (BIL-06, A-32)', async () => {
    const order = await confirmedOrder();
    expect((await invoice([order.id])).status).toBe(201);
    expect((await post(admin, `/api/orders/${order.id}/cancel`, { reason: 'Office closed for the day' })).status).toBe(200);

    const [credit] = await pendingFor(order.id);
    expect(credit).toMatchObject({ amountCents: -order.totalCents, reason: 'CANCELLED_AFTER_INVOICE' });
    expect(await netCharge(order.id)).toBe(0);

    const next = await invoice([], [credit!.id]);
    expect(next.status).toBe(201);
    expect((next.body as InvoiceDetailDto).totalCents).toBe(-order.totalCents); // a credit note is allowed (A-33)
    expect(await pendingFor(order.id)).toHaveLength(0);
  });

  it('money-changing edits are blocked once invoiced (A-32)', async () => {
    const order = await confirmedOrder(2);
    expect((await invoice([order.id])).status).toBe(201);
    const fresh = (await admin.get(`/api/orders/${order.id}`)).body as OrderDetailDto;
    const res = await put(admin, `/api/orders/${order.id}`, {
      version: fresh.version,
      deliveryDate: LOCKED_DATE,
      lines: [{ dishId: bowl.id, quantity: 3, combinations: [bowlCombo(bowl, 3)] }],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ORDER_INVOICED');
  });

  it('credits are bounded by what was billed for the order', async () => {
    const order = await confirmedOrder(2);
    expect((await invoice([order.id])).status).toBe(201);
    const tooBig = await post(admin, `/api/orders/${order.id}/adjustments`, { amountCents: -(order.totalCents + 1), reason: 'SHORT_DELIVERY', note: 'Two boxes missing' });
    expect(tooBig.status).toBe(422);
    expect(tooBig.body.error.code).toBe('CREDIT_EXCEEDS_BILLED');

    expect((await post(admin, `/api/orders/${order.id}/adjustments`, { amountCents: -700, reason: 'SHORT_DELIVERY', note: 'One box missing' })).status).toBe(201);
    const rest = await post(admin, `/api/orders/${order.id}/adjustments`, { amountCents: -(order.totalCents - 700 + 1), reason: 'OTHER', note: 'Too much' });
    expect(rest.status).toBe(422);
    // Then cancelling only credits what is left.
    expect((await post(admin, `/api/orders/${order.id}/cancel`, { reason: 'Customer complaint' })).status).toBe(200);
    expect(await netCharge(order.id)).toBe(0);
  });

  it('cancelling a not-yet-invoiced order reverses its pending credit, so nothing is owed either way', async () => {
    const order = await confirmedOrder(2);
    expect((await post(admin, `/api/orders/${order.id}/adjustments`, { amountCents: -500, reason: 'PRICE_CORRECTION', note: 'Promised discount' })).status).toBe(201);
    expect((await post(admin, `/api/orders/${order.id}/cancel`, { reason: 'Event cancelled' })).status).toBe(200);
    const pending = await pendingFor(order.id);
    expect(pending.map((a) => a.amountCents).sort((x, y) => x - y)).toEqual([-500, 500]);
    expect(await netCharge(order.id)).toBe(0);
  });

  it('marks an invoice paid once; the date can’t be in the future (BIL-04)', async () => {
    const order = await confirmedOrder();
    const inv = (await invoice([order.id])).body as InvoiceDetailDto;
    const future = await post(admin, `/api/billing/invoices/${inv.id}/mark-paid`, { paidOn: '2027-03-05' });
    expect(future.status).toBe(422);
    const paid = await post(admin, `/api/billing/invoices/${inv.id}/mark-paid`, { reference: 'NEFT 1234' });
    expect(paid.status).toBe(200);
    expect(paid.body).toMatchObject({ status: 'PAID', paymentReference: 'NEFT 1234', paidBy: 'Aditi Rao' });
    const again = await post(admin, `/api/billing/invoices/${inv.id}/mark-paid`, {});
    expect(again.status).toBe(409);
  });

  it('refuses another company’s orders, non-billable orders, and non-billing roles', async () => {
    const banyanEmployee = await prisma.employee.findFirstOrThrow({ where: { company: { name: 'Banyan Analytics' } }, orderBy: { email: 'desc' } });
    const banyanMenu = (await admin.get(`/api/ordering/menu?employeeId=${banyanEmployee.id}`)).body as EmployeeMenuDto;
    const banyanBowl = findDish(banyanMenu, 'FL-BWL-001');
    const other = await post(admin, '/api/orders', {
      intent: 'PLACE',
      employeeId: banyanEmployee.id,
      deliveryDate: LOCKED_DATE,
      lines: [{ dishId: banyanBowl.id, quantity: 1, combinations: [bowlCombo(banyanBowl, 1)] }],
    });
    expect(other.status).toBe(201);
    const res = await invoice([other.body.order.id as string]);
    expect(res.status).toBe(422);
    expect(res.body.error.issues[0].path).toEqual(['orderIds', 0]);
    const order = await confirmedOrder();
    expect((await post(admin, `/api/orders/${order.id}/cancel`, { reason: 'No longer needed' })).status).toBe(200);
    expect((await invoice([order.id])).status).toBe(422);

    const kitchen = await login(app, 'kitchen@test.com');
    expect((await kitchen.get('/api/billing/companies')).status).toBe(403);
    expect((await invoice([order.id], [], kitchen)).status).toBe(403);
  });
});
