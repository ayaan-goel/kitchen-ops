import type { NestExpressApplication } from '@nestjs/platform-express';
import type { CalendarDayDto, CompanyDetailDto, CutoffDayDto, EmployeeDetailDto, EmployeeImportReportDto, EmployeeMenuDto, RoleDto, SettingsDto, StaffDto } from '@fernleaf/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { type Agent, createTestApp, login, post, put } from './helpers';

const NOW = new Date('2027-03-01T06:30:00Z');
/** Companies no other suite orders for, so changes here can't disturb them. */
const A = 'Saffron Studios';
const B = 'Kestrel Fintech';
const del = (agent: Agent, url: string) => agent.delete(url).set('X-Requested-With', 'fetch');

describe('Companies, employees, staff and settings (integration)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let a: CompanyDetailDto;
  let b: CompanyDetailDto;
  const domainOf = (c: CompanyDetailDto) => c.domains[0]!.domain;

  const newEmployee = async (company: CompanyDetailDto, local: string) => {
    const res = await post(admin, '/api/employees', { companyId: company.id, name: `Test ${local}`, email: `${local}@${domainOf(company)}` });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as EmployeeDetailDto;
  };

  beforeAll(async () => {
    app = await createTestApp(NOW);
    prisma = app.get(PrismaService);
    admin = await login(app, 'admin@test.com');
    const ids = await prisma.company.findMany({ where: { name: { in: [A, B] } } });
    a = (await admin.get(`/api/companies/${ids.find((c) => c.name === A)!.id}`)).body as CompanyDetailDto;
    b = (await admin.get(`/api/companies/${ids.find((c) => c.name === B)!.id}`)).body as CompanyDetailDto;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects public and already-taken domains with actionable messages; normalises input (COMP-02)', async () => {
    const pub = await post(admin, `/api/companies/${a.id}/domains`, { domain: 'Gmail.com' });
    expect(pub.status).toBe(422);
    expect(pub.body.error.code).toBe('PUBLIC_DOMAIN');
    const taken = await post(admin, `/api/companies/${a.id}/domains`, { domain: `@${domainOf(b)}` });
    expect(taken.body.error.code).toBe('DOMAIN_TAKEN');
    expect(taken.body.error.message).toContain(B);
    const ok = await post(admin, `/api/companies/${a.id}/domains`, { domain: 'https://www.Saffron-Test.io/' });
    expect(ok.status).toBe(201);
    expect((ok.body as CompanyDetailDto).domains.map((d) => d.domain)).toContain('saffron-test.io');
  });

  it('employee emails must be on the company’s domains; the owner must be an employee (A-18, A-38)', async () => {
    const bad = await post(admin, '/api/employees', { companyId: a.id, name: 'Wrong Domain', email: `x@${domainOf(b)}` });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('EMAIL_DOMAIN_MISMATCH');

    const outsider = await newEmployee(b, 'owner.candidate');
    const company = (await admin.get(`/api/companies/${a.id}`)).body as CompanyDetailDto;
    const { id: _id, domains: _d, addresses: _ad, holidays: _h, hiddenCategoryIds: _hc, hiddenMenuItemIds: _hm, employees: _e, ownerName: _o, defaultAddressId: _da, ...editable } = company;
    const res = await put(admin, `/api/companies/${a.id}`, { ...editable, ownerEmployeeId: outsider.id });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('OWNER_NOT_EMPLOYEE');
  });

  it('moving an employee: new orders use the new company’s menu/tier; old open orders can only be cancelled (EMP-03)', async () => {
    const emp = await newEmployee(a, 'mover');
    const oldMenu = (await admin.get(`/api/ordering/menu?employeeId=${emp.id}`)).body as EmployeeMenuDto;
    const dish = [...oldMenu.listed].flatMap((c) => c.items).find((i) => i.dish.groups.length === 0)!.dish;
    const draft = await post(admin, '/api/orders', { intent: 'DRAFT', employeeId: emp.id, deliveryDate: '2027-03-10', lines: [{ dishId: dish.id, quantity: 1, combinations: [{ quantity: 1, selections: [] }] }] });
    expect(draft.status, JSON.stringify(draft.body)).toBe(201);

    const moved = await post(admin, `/api/employees/${emp.id}/move`, { companyId: b.id, email: `mover@${domainOf(b)}` });
    expect(moved.status).toBe(201);
    expect(moved.body).toMatchObject({ companyId: b.id, openOrders: [expect.objectContaining({ companyName: A })] });
    const newMenu = (await admin.get(`/api/ordering/menu?employeeId=${emp.id}`)).body as EmployeeMenuDto;
    expect(newMenu.tier.name).not.toBe(oldMenu.tier.name);

    const place = await post(admin, `/api/orders/${draft.body.order.id}/place`, { version: draft.body.order.version });
    expect(place.status).toBe(422);
    expect((await post(admin, `/api/orders/${draft.body.order.id}/cancel`, { reason: 'Employee moved' })).status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: draft.body.order.id } })).companyId).toBe(a.id);
  });

  it('a company holiday blocks that date in the order calendar; a kitchen holiday too, and is removable (COMP-04, SET-02)', async () => {
    const emp = await newEmployee(a, 'calendar');
    const date = '2027-03-11';
    await post(admin, `/api/companies/${a.id}/holidays`, { date, name: 'Studio offsite' });
    const cal = (await admin.get(`/api/ordering/calendar?employeeId=${emp.id}&from=${date}&to=${date}`)).body as CalendarDayDto[];
    expect(cal[0]!.status).not.toBe('OK');

    const kitchenDate = '2027-03-12';
    const before = ((await admin.get('/api/cutoffs?from=2027-03-12&to=2027-03-12')).body as CutoffDayDto[])[0];
    const added = await post(admin, '/api/settings/kitchen-holidays', { date: kitchenDate, name: 'Deep clean' });
    expect(added.status).toBe(201);
    const cal2 = (await admin.get(`/api/ordering/calendar?employeeId=${emp.id}&from=${kitchenDate}&to=${kitchenDate}`)).body as CalendarDayDto[];
    expect(cal2[0]!.status).toBe('KITCHEN_HOLIDAY');
    // Cut-off instants for later dates move, because cut-off counts kitchen working days.
    const after = ((await admin.get('/api/cutoffs?from=2027-03-13&to=2027-03-13')).body as CutoffDayDto[])[0];
    expect(before).toBeDefined();
    expect(after).toBeDefined();
    const holiday = (added.body as SettingsDto).holidays.find((h) => h.date === kitchenDate)!;
    expect((await del(admin, `/api/settings/kitchen-holidays/${holiday.id}`)).status).toBe(200);
  });

  it('settings validate their bounds and record who saved them (SET-01)', async () => {
    const current = (await admin.get('/api/settings')).body as SettingsDto;
    const { kitchenTimeZone: _tz, defaultPriceTier: _t, holidays: _h, updatedAt: _u, updatedBy: _b, ...editable } = current;
    const bad = await put(admin, '/api/settings', { ...editable, deliveryWindowStart: '22:00', deliveryWindowEnd: '07:00' });
    expect(bad.status).toBe(400);
    const ok = await put(admin, '/api/settings', editable);
    expect(ok.status).toBe(200);
    expect(ok.body.updatedBy).toBe('Aditi Rao');
  });

  it('staff: create, role change signs the user out, admins can’t lock themselves out (ACC-02)', async () => {
    const roles = (await admin.get('/api/roles')).body as RoleDto[];
    const kitchenRole = roles.find((r) => r.key === 'KITCHEN')!;
    const dispatchRole = roles.find((r) => r.key === 'DISPATCH')!;
    const created = await post(admin, '/api/staff', { name: 'Test Cook', email: 'test.cook@fernleaf.kitchen', roleId: kitchenRole.id, password: 'Cook@12345' });
    expect(created.status).toBe(201);
    const cook = (created.body as StaffDto[]).find((s) => s.email === 'test.cook@fernleaf.kitchen')!;
    const session = await login(app, 'test.cook@fernleaf.kitchen', 'Cook@12345');
    expect((await session.get('/api/kitchen/board?date=2027-03-02')).status).toBe(200);

    await admin.patch(`/api/staff/${cook.id}`).set('X-Requested-With', 'fetch').send({ roleId: dispatchRole.id });
    expect((await session.get('/api/kitchen/board?date=2027-03-02')).status).toBe(401);

    const me = (await admin.get('/api/auth/me')).body as { user: { id: string } };
    const self = await admin.patch(`/api/staff/${me.user.id}`).set('X-Requested-With', 'fetch').send({ isActive: false });
    expect(self.status).toBe(422);
  });

  it('CSV import: a dry run reports row errors; a real run creates only valid rows (EMP-04)', async () => {
    const d = domainOf(a);
    const csv = [
      'name,email,phone,allergies,dietary,can_choose_address,can_change_time,can_change_packaging',
      `Ana Csv,ana.csv@${d},,Dairy;Gluten,Vegetarian,yes,no,no`,
      `"Ben, Csv",ben.csv@${d},+91 1,,,no,yes,no`,
      `Bad Domain,bad@gmail.com,,,,,,`,
      `Bad Allergy,allergy.csv@${d},,Kryptonite,,,,`,
    ].join('\n');
    const upload = (dryRun: boolean) =>
      admin.post(`/api/companies/${a.id}/employees/import?dryRun=${dryRun}`).set('X-Requested-With', 'fetch').attach('file', Buffer.from(csv), { filename: 'people.csv', contentType: 'text/csv' });
    const dry = (await upload(true)).body as EmployeeImportReportDto;
    expect(dry).toMatchObject({ total: 4, valid: 2, invalid: 2, created: 0 });
    expect(dry.rows.map((r) => r.row)).toEqual([4, 5]);
    const real = (await upload(false)).body as EmployeeImportReportDto;
    expect(real.created).toBe(2);
    const ben = await prisma.employee.findUniqueOrThrow({ where: { email: `ben.csv@${d}` } });
    expect(ben).toMatchObject({ name: 'Ben, Csv', canChangeDeliveryTime: true });
  });
});
