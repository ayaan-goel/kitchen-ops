import type { NestExpressApplication } from '@nestjs/platform-express';
import type { DishDetailDto, EmployeeMenuDto, PriceTierDto, TierGridDto } from '@fernleaf/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { type Agent, createTestApp, login, post, put } from './helpers';

const NOW = new Date('2027-03-01T06:30:00Z');
/** A group-less dessert no other suite orders, so changing its prices can't disturb them. */
const SKU = 'FL-DST-003';

describe('Catalogue, pricing and menu admin (integration)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: Agent;
  let tiers: PriceTierDto[];
  const tier = (name: string) => tiers.find((t) => t.name === name)!;
  const gridRow = async (tierName: string, dishId: string) =>
    ((await admin.get(`/api/price-tiers/${tier(tierName).id}/grid?kind=dishes`)).body as TierGridDto).rows.find((r) => r.itemId === dishId)!;

  beforeAll(async () => {
    app = await createTestApp(NOW);
    prisma = app.get(PrismaService);
    admin = await login(app, 'admin@test.com');
    tiers = (await admin.get('/api/price-tiers')).body as PriceTierDto[];
  });

  afterAll(async () => {
    await app?.close();
  });

  it('a Standard price change flows into the derived Enterprise price, rounded up to 5¢ (PRICE-06)', async () => {
    const dish = await prisma.dish.findUniqueOrThrow({ where: { sku: SKU } });
    expect((await gridRow('Enterprise', dish.id)).effectiveCents).toBe(255); // 280 × 0.9 = 252 → 255
    const res = await put(admin, `/api/price-tiers/${tier('Standard').id}/prices`, { kind: 'dishes', itemId: dish.id, priceCents: 300 });
    expect(res.status).toBe(200);
    expect(await gridRow('Enterprise', dish.id)).toMatchObject({ effectiveCents: 270, source: 'DERIVED' });

    // An override on the derived tier wins; clearing it falls back to the rule.
    await put(admin, `/api/price-tiers/${tier('Enterprise').id}/prices`, { kind: 'dishes', itemId: dish.id, priceCents: 199 });
    expect(await gridRow('Enterprise', dish.id)).toMatchObject({ effectiveCents: 199, source: 'OVERRIDE', derivedCents: 270 });
    await put(admin, `/api/price-tiers/${tier('Enterprise').id}/prices`, { kind: 'dishes', itemId: dish.id, priceCents: null });
    expect((await gridRow('Enterprise', dish.id)).source).toBe('DERIVED');
  });

  it('removing a Startup price flags it missing and the preview for a Startup company excludes it (PRICE-05, MENU-04)', async () => {
    const dish = await prisma.dish.findUniqueOrThrow({ where: { sku: SKU } });
    const before = tier('Startup').missingDishes;
    await put(admin, `/api/price-tiers/${tier('Startup').id}/prices`, { kind: 'dishes', itemId: dish.id, priceCents: null });
    expect((await gridRow('Startup', dish.id)).source).toBe('MISSING');
    const after = ((await admin.get('/api/price-tiers')).body as PriceTierDto[]).find((t) => t.name === 'Startup')!;
    expect(after.missingDishes).toBe(before + 1);

    const employee = await prisma.employee.findFirstOrThrow({ where: { company: { name: 'Quill & Co Legal' } } });
    const preview = (await admin.get(`/api/menu/preview?employeeId=${employee.id}`)).body as EmployeeMenuDto;
    expect(preview.tier.name).toBe('Startup');
    expect(preview.listed.flatMap((c) => c.items).some((i) => i.dish.sku === SKU)).toBe(false);
    expect(preview.excluded).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'ITEM', reason: 'NO_PRICE', name: dish.name })]));
  });

  it('rejects a tier that would derive from itself through a loop (TIER_CYCLE)', async () => {
    const res = await put(admin, `/api/price-tiers/${tier('Standard').id}`, {
      name: 'Standard',
      derivation: 'FROM_TIER',
      baseTierId: tier('Enterprise').id,
      multiplierBps: 10_000,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TIER_CYCLE');
  });

  it('rejects a portion group containing an option that is not sold in that size (BR-07)', async () => {
    const dish = await prisma.dish.findUniqueOrThrow({ where: { sku: 'FL-BWL-001' } });
    const detail = (await admin.get(`/api/dishes/${dish.id}`)).body as DishDetailDto;
    const protein = detail.groups.find((g) => !g.usesPortions)!;
    const large = await prisma.portionSize.findUniqueOrThrow({ where: { name: 'Large' } });
    const res = await put(admin, `/api/dishes/${dish.id}/option-groups`, {
      groups: detail.groups.map((g) => (g.id === protein.id ? { ...g, usesPortions: true, portionSizeIds: [large.id] } : g)),
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PORTION_INVALID');
    expect(res.body.error.issues[0].message).toMatch(/isn't offered in Large/);
    // Unchanged.
    expect(((await admin.get(`/api/dishes/${dish.id}`)).body as DishDetailDto).groups).toEqual(detail.groups);
  });

  it('creates a dish (SKU unique), edits its groups by id, and deactivates it instead of deleting', async () => {
    const station = await prisma.kitchenStation.findFirstOrThrow();
    const body = { sku: 'fl-tst-901', name: 'Test Kheer', temperature: 'COLD', costCents: 90, stationId: station.id };
    const created = await post(admin, '/api/dishes', body);
    expect(created.status).toBe(201);
    expect(created.body.sku).toBe('FL-TST-901');
    const dupe = await post(admin, '/api/dishes', { ...body, name: 'Other' });
    expect(dupe.status).toBe(422);
    expect(dupe.body.error.issues[0].path).toEqual(['sku']);

    const options = await prisma.option.findMany({ take: 2, where: { portions: { none: {} } } });
    const withGroup = await put(admin, `/api/dishes/${created.body.id}/option-groups`, {
      groups: [{ name: 'Topping', isRequired: false, maxSelections: 2, usesPortions: false, optionIds: options.map((o) => o.id) }],
    });
    expect(withGroup.status).toBe(200);
    const groupId = (withGroup.body as DishDetailDto).groups[0]!.id;
    const renamed = await put(admin, `/api/dishes/${created.body.id}/option-groups`, {
      groups: [{ id: groupId, name: 'Toppings', isRequired: true, maxSelections: 1, usesPortions: false, optionIds: [options[0]!.id] }],
    });
    expect((renamed.body as DishDetailDto).groups[0]).toMatchObject({ id: groupId, name: 'Toppings', isRequired: true });

    const off = await put(admin, `/api/dishes/${created.body.id}`, { ...body, isActive: false });
    expect(off.body.isActive).toBe(false);
  });

  it('reference lists: unique names, deactivate instead of delete; non-admins cannot write', async () => {
    const created = await post(admin, '/api/reference/allergens', { name: 'Test allergen' });
    expect(created.status).toBe(201);
    const row = (created.body as { id: string; name: string }[]).find((a) => a.name === 'Test allergen')!;
    expect((await post(admin, '/api/reference/allergens', { name: 'Test allergen' })).status).toBe(422);
    const off = await admin.patch(`/api/reference/allergens/${row.id}`).set('X-Requested-With', 'fetch').send({ isActive: false });
    expect((off.body as { id: string; isActive: boolean }[]).find((a) => a.id === row.id)!.isActive).toBe(false);

    const kitchen = await login(app, 'kitchen@test.com');
    expect((await post(kitchen, '/api/reference/allergens', { name: 'Nope' })).status).toBe(403);
    expect((await post(kitchen, '/api/price-tiers', { name: 'Nope', derivation: 'MANUAL' })).status).toBe(403);
  });
});
