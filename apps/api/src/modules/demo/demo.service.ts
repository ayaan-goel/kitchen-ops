import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import {
  addDays,
  type CalendarDate,
  cutoffAt,
  dateRange,
  dbDate,
  deliveryDayStatus,
  fromDbDate,
  isoWeekday,
  type LineInput,
  type OrderableDish,
  plannedTimes,
  priceOrderLines,
  zonedInstant,
} from '@fernleaf/domain';
import { formatInvoiceNumber } from '@fernleaf/shared';
import { DateTime } from 'luxon';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { Prisma } from '../../generated/prisma/client';
import { BillingService } from '../billing/billing.service';
import { CutoffService } from '../cutoff/cutoff.service';
import { formatAddress } from '../ordering/order-pipeline.service';
import { MenuCatalogueService } from '../ordering/menu-catalogue.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';

/** Orders per company on an ordinary working day (scaled ×3 on Wednesdays: the ~400-order day, KIT-12). */
const BASE_VOLUME: Record<string, number> = {
  'Banyan Analytics': 34,
  'Kestrel Fintech': 26,
  'Lumen Health': 24,
  'Orbit Support Services': 24,
  'Quill & Co Legal': 11,
  'Saffron Studios': 17,
};
const WINDOW_BACK = 14;
const WINDOW_AHEAD = 7;
const THROTTLE_MS = 5 * 60_000;
const BIG_DAY_WEEKDAY = 3; // Wednesday

/** Small deterministic PRNG so a date always generates the same orders. */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
    chance: (p: number) => next() < p,
  };
}
type Rng = ReturnType<typeof rng>;

export interface DemoSummary {
  generatedDates: string[];
  ordersCreated: number;
  invoicesCreated: number;
  ms: number;
}

/**
 * Rolling demo data (A-40, DEMO-02/03, TRD §6.17): whichever day reviewers open the app, the last
 * two weeks, today and the next week are populated. Orders are validated and priced by the same
 * domain functions as the API, confirmed by the real cut-off processor, then moved along by an
 * autopilot that only touches demo orders nobody has acted on. Enabled by DEMO_DATA_ENABLED.
 */
@Injectable()
export class DemoService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoService.name);
  private inflight: Promise<DemoSummary> | null = null;
  private lastRunAt = 0;

  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly settings: PlatformSettingsService,
    private readonly cutoff: CutoffService,
    private readonly catalogue: MenuCatalogueService,
    private readonly billing: BillingService,
  ) {}

  get enabled(): boolean {
    return this.env.DEMO_DATA_ENABLED;
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    setTimeout(() => this.kick(true), 3_000).unref();
  }

  /** Non-blocking trigger (boot, first requests of a new day, daily timer). Throttled. */
  kick(force = false): void {
    if (!this.enabled || this.inflight) return;
    if (!force && Date.now() - this.lastRunAt < THROTTLE_MS) return;
    void this.ensure().catch((err: unknown) => this.logger.error({ err }, 'Demo data refresh failed'));
  }

  ensure(): Promise<DemoSummary> {
    this.inflight ??= this.run().finally(() => {
      this.inflight = null;
      this.lastRunAt = Date.now();
    });
    return this.inflight;
  }

  private async run(): Promise<DemoSummary> {
    const started = Date.now();
    const today = this.clock.today();
    const dates = dateRange(addDays(today, -WINDOW_BACK), addDays(today, WINDOW_AHEAD));
    const done = new Set(
      (await this.prisma.demoDay.findMany({ where: { date: { gte: dbDate(dates[0]!) } }, select: { date: true } })).map((d) => fromDbDate(d.date)),
    );
    const missing = dates.filter((d) => !done.has(d));
    let ordersCreated = 0;
    for (const date of missing) ordersCreated += await this.generateDate(date);

    await this.cutoff.catchUp('SCHEDULED');
    await this.backdateCutoffs(missing);
    await this.autopilot();
    const invoicesCreated = await this.billingHistory(today);
    const summary = { generatedDates: missing, ordersCreated, invoicesCreated, ms: Date.now() - started };
    if (missing.length || invoicesCreated) this.logger.log(summary, 'Demo data refreshed');
    return summary;
  }

  // ───────────────────────── generation ─────────────────────────

  private async generateDate(date: CalendarDate): Promise<number> {
    const { settings, kitchen, cutoff } = await this.settings.get();
    const zone = this.clock.zone;
    const now = this.clock.now();
    const r = rng(`fernleaf-demo:${date}`);
    const cutoffInstant = cutoffAt(date, cutoff, kitchen, zone);
    const locked = now >= cutoffInstant;
    const companies = await this.prisma.company.findMany({
      include: {
        holidays: { select: { date: true } },
        addresses: { where: { isActive: true } },
        employees: { select: { id: true, canChooseAddress: true, canChangeDeliveryTime: true, canChangePackaging: true } },
      },
    });
    const packaging = await this.prisma.packagingType.findMany({ where: { isActive: true }, select: { id: true } });

    const orders: Prisma.OrderCreateManyInput[] = [];
    const lines: Prisma.OrderLineCreateManyInput[] = [];
    const combos: Prisma.OrderLineCombinationCreateManyInput[] = [];
    const selections: Prisma.OrderLineSelectionCreateManyInput[] = [];
    const events: Prisma.OrderEventCreateManyInput[] = [];

    for (const company of companies) {
      const status = deliveryDayStatus(date, kitchen, {
        workingDays: company.workingDays,
        holidays: new Set(company.holidays.map((h) => fromDbDate(h.date))),
      });
      const defaultAddress = company.addresses.find((a) => a.id === company.defaultAddressId) ?? company.addresses[0];
      if (status !== 'OK' || !defaultAddress || company.employees.length === 0) continue;

      const { menu, tier } = await this.catalogue.forCompany(company.id);
      const dishes = this.dishPools(menu.listed, menu.orderable);
      if (dishes.main.length === 0) continue;

      const factor = isoWeekday(date) === BIG_DAY_WEEKDAY ? 3 : isoWeekday(date) >= 6 ? 0.8 : 1;
      const wanted = Math.round((BASE_VOLUME[company.name] ?? 12) * factor * (0.85 + r.next() * 0.3));
      const count = Math.min(wanted, Math.floor(company.employees.length * 0.9));
      const staff = [...company.employees].sort(() => r.next() - 0.5).slice(0, count);
      const sevenDay = company.workingDays.length === 7;

      for (const employee of staff) {
        // Delivery time: the company default unless this employee may choose (A-20).
        let time = company.defaultDeliveryTime;
        if (employee.canChangeDeliveryTime && r.chance(0.6)) {
          const options = sevenDay ? [510, time, time + 30, 1170, 1200] : [time - 30, time - 15, time + 15, time + 30];
          time = Math.min(settings.deliveryWindowEnd, Math.max(settings.deliveryWindowStart, r.pick(options)));
        }
        const address = employee.canChooseAddress && company.addresses.length > 1 && r.chance(0.5) ? r.pick(company.addresses) : defaultAddress;
        const packagingTypeId = employee.canChangePackaging && r.chance(0.4) ? r.pick(packaging).id : company.defaultPackagingTypeId;

        const priced = this.buildLines(r, time < 660 ? dishes.breakfast : dishes.main, dishes.extras, menu.orderable);
        if (!priced) continue;

        const orderId = randomUUID();
        const deliveryAt = zonedInstant(date, time, zone);
        const planned = plannedTimes(deliveryAt, company.dispatchLeadMinutes, settings.kitchenBufferMinutes);
        const createdAt = locked
          ? new Date(cutoffInstant.getTime() - r.int(30, 60 * 70) * 60_000)
          : new Date(Math.min(now.getTime() - r.int(2, 60 * 30) * 60_000, cutoffInstant.getTime() - 60_000));
        const isDraft = r.chance(locked ? 0.06 : 0.18);

        orders.push({
          id: orderId,
          status: isDraft ? 'DRAFT' : 'PLACED',
          employeeId: employee.id,
          companyId: company.id,
          priceTierId: tier.id,
          deliveryDate: dbDate(date),
          deliveryTime: time,
          deliveryAt,
          addressId: address.id,
          addressSnapshot: formatAddress(address),
          packagingTypeId,
          totalCents: priced.totalCents,
          dispatchLeadMinutes: company.dispatchLeadMinutes,
          plannedDispatchReadyAt: planned.plannedDispatchReadyAt,
          plannedKitchenReadyAt: planned.plannedKitchenReadyAt,
          placedAt: isDraft ? null : createdAt,
          createdById: null,
          createdAt,
        });
        events.push({ orderId, type: 'CREATED', at: createdAt, actorId: null });
        if (!isDraft) events.push({ orderId, type: 'PLACED', at: createdAt, actorId: null });

        priced.lines.forEach((line, sortOrder) => {
          const lineId = randomUUID();
          lines.push({
            id: lineId,
            orderId,
            dishId: line.dishId,
            quantity: line.quantity,
            dishName: line.dishName,
            dishSku: line.dishSku,
            dishTemperature: line.dishTemperature,
            dishUnitPriceCents: line.dishUnitPriceCents,
            dishUnitCostCents: line.dishUnitCostCents,
            lineTotalCents: line.lineTotalCents,
            sortOrder,
            pricedAt: createdAt,
          });
          for (const c of line.combinations) {
            const comboId = randomUUID();
            combos.push({
              id: comboId,
              orderLineId: lineId,
              quantity: c.quantity,
              signature: c.signature,
              label: c.label,
              unitPriceCents: c.unitPriceCents,
              unitCostCents: c.unitCostCents,
              totalCents: c.totalCents,
            });
            for (const s of c.selections) {
              selections.push({
                combinationId: comboId,
                optionGroupId: s.groupId,
                optionId: s.optionId,
                portionSizeId: s.portionSizeId,
                groupName: s.groupName,
                optionName: s.optionName,
                portionName: s.portionName,
                optionUnitPriceCents: s.optionUnitPriceCents,
                portionExtraCents: s.portionExtraCents,
                unitCostCents: s.unitCostCents,
              });
            }
          }
        });
      }
    }

    const chunk = async <T>(rows: T[], insert: (batch: T[]) => Promise<unknown>) => {
      for (let i = 0; i < rows.length; i += 1000) await insert(rows.slice(i, i + 1000));
    };
    // Sorted by delivery time so order numbers read naturally within a day.
    orders.sort((a, b) => (a.deliveryAt as Date).getTime() - (b.deliveryAt as Date).getTime() || (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime());
    await this.prisma.$transaction(
      async (tx) => {
        await chunk(orders, (b) => tx.order.createMany({ data: b }));
        await chunk(lines, (b) => tx.orderLine.createMany({ data: b }));
        await chunk(combos, (b) => tx.orderLineCombination.createMany({ data: b }));
        await chunk(selections, (b) => tx.orderLineSelection.createMany({ data: b.map((s) => ({ ...s, id: randomUUID() })) }));
        await chunk(events, (b) => tx.orderEvent.createMany({ data: b.map((e) => ({ ...e, id: randomUUID() })) }));
        await tx.demoDay.create({ data: { date: dbDate(date), orderCount: orders.length } });
      },
      { timeout: 180_000, maxWait: 20_000 },
    );
    return orders.length;
  }

  private dishPools(listed: { slug: string; items: { dish: OrderableDish }[] }[], orderable: ReadonlyMap<string, OrderableDish>) {
    const bySlug = (slugs: string[]) => listed.filter((c) => slugs.includes(c.slug)).flatMap((c) => c.items.map((i) => i.dish)).filter((d) => orderable.has(d.id));
    const main = bySlug(['bowls', 'thalis', 'wraps-rolls', 'salads']);
    const breakfast = bySlug(['breakfast']);
    return { main, breakfast: breakfast.length ? breakfast : main, extras: bySlug(['desserts', 'beverages']) };
  }

  /** One main dish (+ sometimes a drink or dessert), mostly single boxes, sometimes a team order. */
  private buildLines(r: Rng, mains: OrderableDish[], extras: OrderableDish[], orderable: ReadonlyMap<string, OrderableDish>) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const team = r.chance(0.04);
      const picks: { dish: OrderableDish; qty: number }[] = [{ dish: r.pick(mains), qty: team ? r.int(6, 10) : r.chance(0.08) ? 2 : 1 }];
      if (extras.length && r.chance(0.3)) picks.push({ dish: r.pick(extras), qty: picks[0]!.qty });
      const input: LineInput[] = picks.map(({ dish, qty }) => {
        const quantity = Math.max(qty, dish.minOrderQty ?? 1);
        const parts = quantity >= 4 && dish.groups.length ? [quantity - Math.floor(quantity / 3), Math.floor(quantity / 3)] : [quantity];
        return { dishId: dish.id, quantity, combinations: parts.map((q, i) => ({ quantity: q, selections: this.choose(r, dish, attempt + i) })) };
      });
      const priced = priceOrderLines(input, orderable);
      if (priced.issues.length === 0) return priced;
    }
    return null;
  }

  private choose(r: Rng, dish: OrderableDish, variant: number) {
    const out: { groupId: string; optionId: string; portionSizeId: string | null }[] = [];
    for (const g of dish.groups) {
      if (g.options.length === 0 || (!g.isRequired && !r.chance(0.35))) continue;
      const option = g.options[(Math.floor(r.next() * g.options.length) + variant) % g.options.length]!;
      out.push({ groupId: g.id, optionId: option.optionId, portionSizeId: g.usesPortions && g.portionSizes.length ? r.pick(g.portionSizes).id : null });
    }
    return out;
  }

  /** Demo dates processed at generation time get their confirmations dated at the real cut-off. */
  private async backdateCutoffs(dates: CalendarDate[]): Promise<void> {
    const { kitchen, cutoff } = await this.settings.get();
    const now = this.clock.now();
    for (const date of dates) {
      const at = cutoffAt(date, cutoff, kitchen, this.clock.zone);
      if (at > now) continue;
      await this.prisma.$executeRaw`UPDATE "Order" SET "confirmedAt" = ${at} WHERE "deliveryDate" = ${date}::date AND "createdById" IS NULL AND "confirmedAt" > ${at}`;
      await this.prisma.$executeRaw`UPDATE "Order" SET "cancelledAt" = ${at} WHERE "deliveryDate" = ${date}::date AND "createdById" IS NULL AND "status" = 'CANCELLED' AND "cancelledAt" > ${at}`;
      await this.prisma.$executeRaw`
        UPDATE "OrderEvent" e SET "at" = ${at}
          FROM "Order" o
         WHERE e."orderId" = o."id" AND o."deliveryDate" = ${date}::date AND o."createdById" IS NULL
           AND e."actorId" IS NULL AND e."type" IN ('CONFIRMED', 'CANCELLED', 'DROP_ASSIGNED') AND e."at" > ${at}`;
      await this.prisma.$executeRaw`UPDATE "CutoffRun" SET "firstRunAt" = ${at}, "lastRunAt" = ${at}, "trigger" = 'SCHEDULED' WHERE "deliveryDate" = ${date}::date AND "firstRunAt" > ${at}`;
    }
  }

  // ───────────────────────── autopilot ─────────────────────────

  /**
   * Moves demo orders along by the clock (DEMO-03). Set-based and idempotent: choices use a hash of
   * the row id (not random()), timestamps are never moved, so re-running changes nothing.
   * Only orders created by the generator with no human event are touched.
   */
  private async autopilot(): Promise<void> {
    const now = this.clock.now();
    const today = this.clock.today();
    const { settings } = await this.settings.get();
    const grace = settings.onTimeGraceMinutes;
    // Cooks = can work units but not force-complete (i.e. not admins); permission-based, never a role name.
    const cooks = await this.prisma.staffUser.findMany({
      where: { isActive: true, role: { permissions: { has: 'kitchen.work' } }, NOT: { role: { permissions: { has: 'kitchen.forceComplete' } } } },
      select: { id: true },
      orderBy: { email: 'asc' },
    });
    const cookA = cooks[0]?.id ?? null;
    const cookB = cooks[1]?.id ?? cookA;
    const driverTest = (await this.prisma.staffUser.findUnique({ where: { email: 'driver@test.com' }, select: { id: true } }))?.id ?? '00000000-0000-0000-0000-000000000000';
    const demo = (alias: string) => Prisma.raw(`${alias}."createdById" IS NULL AND NOT EXISTS (SELECT 1 FROM "OrderEvent" he WHERE he."orderId" = ${alias}."id" AND he."actorId" IS NOT NULL)`);
    const h = (expr: string, mod: number) => Prisma.raw(`(abs(hashtext(${expr})) % ${mod})`);

    await this.prisma.$transaction(
      async (tx) => {
        // 1. A few rejections and admin cancellations (≈ 1 % each) on confirmed orders the kitchen hasn't started.
        const voided = await tx.$queryRaw<{ id: string; status: string; at: Date }[]>`
          UPDATE "Order" o
             SET "status" = CASE WHEN ${h('o."id"::text', 100)} = 0 THEN 'REJECTED'::"OrderStatus" ELSE 'CANCELLED'::"OrderStatus" END,
                 "rejectedAt" = CASE WHEN ${h('o."id"::text', 100)} = 0 THEN LEAST(${now}::timestamptz, o."plannedKitchenReadyAt" - interval '3 hours') END,
                 "cancelledAt" = CASE WHEN ${h('o."id"::text', 100)} = 1 THEN LEAST(${now}::timestamptz, o."plannedKitchenReadyAt" - interval '3 hours') END,
                 "statusReason" = CASE WHEN ${h('o."id"::text', 100)} = 0 THEN 'Kitchen at capacity for this slot' ELSE 'Employee on leave (requested by the company)' END,
                 "dropId" = NULL, "version" = o."version" + 1, "updatedAt" = ${now}::timestamptz
           WHERE o."status" = 'CONFIRMED' AND o."deliveryDate" <= ${today}::date AND o."kitchenStartedAt" IS NULL
             AND ${h('o."id"::text', 100)} < 2 AND ${demo('o')}
             AND LEAST(${now}::timestamptz, o."plannedKitchenReadyAt" - interval '3 hours') > o."confirmedAt"
       RETURNING o."id", o."status"::text AS "status", COALESCE(o."rejectedAt", o."cancelledAt") AS "at"`;
        if (voided.length) {
          await tx.orderEvent.createMany({
            data: voided.map((v) => ({
              id: randomUUID(),
              orderId: v.id,
              type: v.status as 'REJECTED' | 'CANCELLED',
              at: v.at,
              actorId: null,
              data: { reason: v.status === 'REJECTED' ? 'Kitchen at capacity for this slot' : 'Employee on leave (requested by the company)' },
            })),
          });
          await tx.$executeRaw`DELETE FROM "Drop" d WHERE d."stage" IN ('PENDING', 'DISPATCH_READY') AND NOT EXISTS (SELECT 1 FROM "Order" o WHERE o."dropId" = d."id" AND o."status" IN ('CONFIRMED', 'DELIVERED'))`;
        }

        // 2. Kitchen units: past dates all done (≈ 5 % finished a little late); today by the clock (≈ 3 % left unfinished → LATE badges).
        await tx.$executeRaw`
          UPDATE "OrderLineCombination" c
             SET "kitchenStartedAt" = COALESCE(c."kitchenStartedAt", LEAST(o."plannedKitchenReadyAt" - make_interval(mins => 25 + ${h('c."id"::text', 35)}), ${now}::timestamptz - interval '6 minutes')),
                 "kitchenStartedById" = COALESCE(c."kitchenStartedById", CASE WHEN ${h('c."id"::text', 2)} = 0 THEN ${cookA}::uuid ELSE ${cookB}::uuid END),
                 "kitchenDoneAt" = LEAST(o."plannedKitchenReadyAt" - make_interval(mins => ${h(`c."id"::text || 'd'`, 15)}) + CASE WHEN ${h(`c."id"::text || 'l'`, 20)} = 0 THEN interval '12 minutes' ELSE interval '0' END, ${now}::timestamptz - interval '1 minute'),
                 "kitchenDoneById" = CASE WHEN ${h('c."id"::text', 2)} = 0 THEN ${cookA}::uuid ELSE ${cookB}::uuid END
            FROM "OrderLine" l JOIN "Order" o ON o."id" = l."orderId"
           WHERE c."orderLineId" = l."id" AND c."kitchenDoneAt" IS NULL AND o."status" = 'CONFIRMED' AND ${demo('o')}
             AND (o."deliveryDate" < ${today}::date
                  OR (o."deliveryDate" = ${today}::date AND o."plannedKitchenReadyAt" <= ${now}::timestamptz + interval '30 minutes' AND ${h(`c."id"::text || 'x'`, 33)} <> 0))`;
        await tx.$executeRaw`
          UPDATE "OrderLineCombination" c
             SET "kitchenStartedAt" = LEAST(o."plannedKitchenReadyAt" - interval '40 minutes', ${now}::timestamptz - interval '2 minutes'),
                 "kitchenStartedById" = CASE WHEN ${h('c."id"::text', 2)} = 0 THEN ${cookA}::uuid ELSE ${cookB}::uuid END
            FROM "OrderLine" l JOIN "Order" o ON o."id" = l."orderId"
           WHERE c."orderLineId" = l."id" AND c."kitchenStartedAt" IS NULL AND o."status" = 'CONFIRMED' AND ${demo('o')}
             AND o."deliveryDate" = ${today}::date AND o."plannedKitchenReadyAt" <= ${now}::timestamptz + interval '90 minutes'`;

        // 3. Order kitchen times + timeline.
        await tx.$executeRaw`
          UPDATE "Order" o SET "kitchenStartedAt" = s."first"
            FROM (SELECT l."orderId", MIN(c."kitchenStartedAt") AS "first" FROM "OrderLineCombination" c JOIN "OrderLine" l ON l."id" = c."orderLineId" GROUP BY l."orderId") s
           WHERE s."orderId" = o."id" AND o."kitchenStartedAt" IS NULL AND s."first" IS NOT NULL AND o."status" = 'CONFIRMED' AND ${demo('o')}`;
        await tx.$executeRaw`
          UPDATE "Order" o SET "kitchenReadyAt" = s."last"
            FROM (SELECT l."orderId", MAX(c."kitchenDoneAt") AS "last", COUNT(*) FILTER (WHERE c."kitchenDoneAt" IS NULL) AS "open"
                    FROM "OrderLineCombination" c JOIN "OrderLine" l ON l."id" = c."orderLineId" GROUP BY l."orderId") s
           WHERE s."orderId" = o."id" AND o."kitchenReadyAt" IS NULL AND s."open" = 0 AND o."status" = 'CONFIRMED' AND ${demo('o')}`;
        for (const [type, column] of [
          ['KITCHEN_STARTED', 'kitchenStartedAt'],
          ['KITCHEN_READY', 'kitchenReadyAt'],
        ] as const) {
          await tx.$executeRaw`
            INSERT INTO "OrderEvent" ("id", "orderId", "type", "at", "actorId")
            SELECT gen_random_uuid(), o."id", ${type}::"OrderEventType", o.${Prisma.raw(`"${column}"`)}, NULL FROM "Order" o
             WHERE o.${Prisma.raw(`"${column}"`)} IS NOT NULL AND o."createdById" IS NULL
               AND NOT EXISTS (SELECT 1 FROM "OrderEvent" e WHERE e."orderId" = o."id" AND e."type" = ${type}::"OrderEventType")`;
        }

        // 4. Drops whose orders are all untouched demo orders and kitchen-ready.
        const dropAgg = Prisma.sql`
          SELECT d."id", d."deliveryAt", d."driverId",
                 MAX(o."kitchenReadyAt") AS "readyAt", MIN(o."plannedDispatchReadyAt") AS "planned"
            FROM "Drop" d JOIN "Order" o ON o."dropId" = d."id" AND o."status" IN ('CONFIRMED', 'DELIVERED')
           GROUP BY d."id"
          HAVING bool_and(o."kitchenReadyAt" IS NOT NULL) AND bool_and(${demo('o')})`;
        // Past: delivered around the delivery time; ≈ 10 % late by 5–24 minutes.
        await tx.$executeRaw`
          WITH a AS (${dropAgg}),
               t AS (SELECT a."id", a."readyAt" + interval '4 minutes' AS "ready",
                            GREATEST(a."readyAt" + interval '8 minutes', a."planned") AS "out",
                            GREATEST(GREATEST(a."readyAt" + interval '8 minutes', a."planned") + interval '10 minutes',
                                     a."deliveryAt" - make_interval(mins => ${h('a."id"::text', 14)})
                                       + CASE WHEN ${h(`a."id"::text || 'late'`, 10)} = 0 THEN make_interval(mins => 5 + ${h(`a."id"::text || 'm'`, 20)}) ELSE interval '0' END) AS "delivered",
                            a."deliveryAt"
                       FROM a)
          UPDATE "Drop" d
             SET "stage" = 'DELIVERED', "dispatchReadyAt" = COALESCE(d."dispatchReadyAt", t."ready"), "outForDeliveryAt" = COALESCE(d."outForDeliveryAt", t."out"),
                 "deliveredAt" = t."delivered", "deliveredOnTime" = t."delivered" <= t."deliveryAt" + make_interval(mins => ${grace}),
                 "deliveredById" = d."driverId", "updatedAt" = ${now}::timestamptz
            FROM t
           WHERE d."id" = t."id" AND d."stage" <> 'DELIVERED' AND d."deliveryDate" < ${today}::date AND d."driverId" IS NOT NULL`;
        // Today, by the clock. driver@test.com's drops stop at dispatch-ready so a reviewer can act as the driver.
        await tx.$executeRaw`
          WITH a AS (${dropAgg})
          UPDATE "Drop" d SET "stage" = 'DISPATCH_READY', "dispatchReadyAt" = LEAST(${now}::timestamptz, GREATEST(a."readyAt" + interval '4 minutes', a."planned" - interval '5 minutes')), "updatedAt" = ${now}::timestamptz
            FROM a WHERE d."id" = a."id" AND d."stage" = 'PENDING' AND d."deliveryDate" = ${today}::date AND a."planned" <= ${now}::timestamptz`;
        await tx.$executeRaw`
          WITH a AS (${dropAgg})
          UPDATE "Drop" d SET "stage" = 'OUT_FOR_DELIVERY', "outForDeliveryAt" = GREATEST(d."dispatchReadyAt", LEAST(${now}::timestamptz, a."planned" + interval '3 minutes')), "updatedAt" = ${now}::timestamptz
            FROM a WHERE d."id" = a."id" AND d."stage" = 'DISPATCH_READY' AND d."deliveryDate" = ${today}::date
             AND a."planned" <= ${now}::timestamptz - interval '10 minutes' AND d."driverId" IS NOT NULL AND d."driverId" <> ${driverTest}::uuid`;
        await tx.$executeRaw`
          WITH a AS (${dropAgg}),
               t AS (SELECT a."id", a."deliveryAt",
                            LEAST(${now}::timestamptz, GREATEST(d."outForDeliveryAt" + interval '10 minutes', a."deliveryAt" - make_interval(mins => ${h('a."id"::text', 12)})
                                  + CASE WHEN ${h(`a."id"::text || 'late'`, 10)} = 0 THEN make_interval(mins => 5 + ${h(`a."id"::text || 'm'`, 20)}) ELSE interval '0' END)) AS "delivered"
                       FROM a JOIN "Drop" d ON d."id" = a."id")
          UPDATE "Drop" d SET "stage" = 'DELIVERED', "deliveredAt" = t."delivered", "deliveredOnTime" = t."delivered" <= t."deliveryAt" + make_interval(mins => ${grace}),
                 "deliveredById" = d."driverId", "updatedAt" = ${now}::timestamptz
            FROM t WHERE d."id" = t."id" AND d."stage" = 'OUT_FOR_DELIVERY' AND d."deliveryDate" = ${today}::date
             AND t."deliveryAt" <= ${now}::timestamptz - interval '15 minutes' AND d."driverId" <> ${driverTest}::uuid`;

        // 5. Orders in delivered drops + timeline for every drop step.
        await tx.$executeRaw`
          UPDATE "Order" o SET "status" = 'DELIVERED', "deliveredAt" = d."deliveredAt", "version" = o."version" + 1, "updatedAt" = ${now}::timestamptz
            FROM "Drop" d WHERE o."dropId" = d."id" AND d."stage" = 'DELIVERED' AND o."status" = 'CONFIRMED' AND ${demo('o')}`;
        for (const [type, column] of [
          ['DISPATCH_READY', 'dispatchReadyAt'],
          ['OUT_FOR_DELIVERY', 'outForDeliveryAt'],
          ['DELIVERED', 'deliveredAt'],
        ] as const) {
          await tx.$executeRaw`
            INSERT INTO "OrderEvent" ("id", "orderId", "type", "at", "actorId", "data")
            SELECT gen_random_uuid(), o."id", ${type}::"OrderEventType", d.${Prisma.raw(`"${column}"`)}, NULL,
                   CASE WHEN ${type} = 'DELIVERED' THEN jsonb_build_object('onTime', d."deliveredOnTime") END
              FROM "Order" o JOIN "Drop" d ON d."id" = o."dropId"
             WHERE d.${Prisma.raw(`"${column}"`)} IS NOT NULL AND o."createdById" IS NULL AND o."status" IN ('CONFIRMED', 'DELIVERED')
               AND NOT EXISTS (SELECT 1 FROM "OrderEvent" e WHERE e."orderId" = o."id" AND e."type" = ${type}::"OrderEventType")`;
        }
      },
      { timeout: 180_000, maxWait: 20_000 },
    );
  }

  // ───────────────────────── billing history ─────────────────────────

  /**
   * Weekly invoices for demo orders delivered more than a week ago (older weeks paid), through the
   * real BillingService; plus one pending short-delivery credit so the adjustment flow is visible.
   */
  private async billingHistory(today: CalendarDate): Promise<number> {
    const admin = await this.prisma.staffUser.findUnique({ where: { email: 'admin@test.com' }, include: { role: true } });
    if (!admin) return 0;
    const actor: AuthUser = { id: admin.id, name: admin.name, email: admin.email, roleKey: admin.role.key, roleName: admin.role.name, dashboard: 'ADMIN', permissions: new Set() };
    const cutoffDate = addDays(today, -7);
    const rows = await this.prisma.order.findMany({
      where: { createdById: null, status: { in: ['CONFIRMED', 'DELIVERED'] }, invoiceLine: { is: null }, deliveryDate: { lt: dbDate(cutoffDate) } },
      select: { id: true, companyId: true, deliveryDate: true },
    });
    const groups = new Map<string, { companyId: string; weekEnd: string; ids: string[] }>();
    for (const o of rows) {
      const d = DateTime.fromJSDate(o.deliveryDate, { zone: 'utc' });
      const weekEnd = d.plus({ days: 7 - d.weekday }).toISODate()!;
      const key = `${o.companyId}|${weekEnd}`;
      const g = groups.get(key) ?? { companyId: o.companyId, weekEnd, ids: [] };
      g.ids.push(o.id);
      groups.set(key, g);
    }
    let created = 0;
    for (const g of [...groups.values()].sort((a, b) => a.weekEnd.localeCompare(b.weekEnd))) {
      const invoice = await this.billing.createInvoice({ companyId: g.companyId, orderIds: g.ids, adjustmentIds: [], notes: `Week ending ${g.weekEnd}` }, actor);
      const issuedAt = zonedInstant(addDays(g.weekEnd, 1), 11 * 60, this.clock.zone);
      const paid = g.weekEnd < addDays(today, -14);
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          issuedAt: issuedAt < this.clock.now() ? issuedAt : this.clock.now(),
          ...(paid
            ? { status: 'PAID', paidAt: zonedInstant(addDays(g.weekEnd, 6), 15 * 60, this.clock.zone), paymentReference: `NEFT ${formatInvoiceNumber(invoice.number).replace('INV-', '')}${g.weekEnd.replaceAll('-', '').slice(2)}`, paidById: admin.id }
            : {}),
        },
      });
      created++;
    }

    const anyCredit = await this.prisma.billingAdjustment.count({ where: { reason: 'SHORT_DELIVERY' } });
    if (anyCredit === 0) {
      const target = await this.prisma.order.findFirst({
        where: { createdById: null, status: 'DELIVERED', invoiceLine: { is: null }, deliveryDate: { lt: dbDate(today) }, totalCents: { gte: 700 } },
        orderBy: { deliveryDate: 'desc' },
        select: { id: true },
      });
      if (target) await this.billing.addAdjustment(target.id, { amountCents: -700, reason: 'SHORT_DELIVERY', note: 'Driver reported one box missing at delivery' }, actor);
    }
    return created;
  }

  /** Used by the admin endpoint to describe what exists. */
  async status(): Promise<{ enabled: boolean; days: { date: string; orders: number }[]; lastRunAt: string | null }> {
    const days = await this.prisma.demoDay.findMany({ orderBy: { date: 'asc' } });
    return {
      enabled: this.enabled,
      days: days.map((d) => ({ date: fromDbDate(d.date), orders: d.orderCount })),
      lastRunAt: this.lastRunAt ? new Date(this.lastRunAt).toISOString() : null,
    };
  }
}
