import { Injectable } from '@nestjs/common';
import { checkAdjustment, dbDate, fromDbDate, invoiceTotal, isBillable, netBilled } from '@fernleaf/domain';
import {
  ADJUSTMENT_REASON_LABELS,
  formatCents,
  type BillableQuery,
  type BillingCompanyDto,
  type CompanyBillableDto,
  type CreateAdjustmentInput,
  type CreateInvoiceInput,
  formatInvoiceNumber,
  formatOrderNumber,
  type InvoiceDetailDto,
  type InvoiceListItemDto,
  type InvoiceListQuery,
  type MarkPaidInput,
  type Paginated,
} from '@fernleaf/shared';
import { DateTime } from 'luxon';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { NotFound, RuleViolation, StateConflict } from '../../common/errors/domain-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { CutoffService } from '../cutoff/cutoff.service';

type Tx = Prisma.TransactionClient;
const BILLABLE = ['CONFIRMED', 'DELIVERED'] as const;

const INVOICE_LIST_SELECT = {
  id: true,
  number: true,
  status: true,
  issuedAt: true,
  periodStart: true,
  periodEnd: true,
  totalCents: true,
  paidAt: true,
  company: { select: { id: true, name: true } },
  _count: { select: { lines: true } },
} satisfies Prisma.InvoiceSelect;

/**
 * Company billing (BIL-01…06). Invoices are immutable snapshots (A-32, A-34): later changes to an
 * invoiced order become adjustments billed on the next invoice. Every money-affecting write locks
 * the orders involved and bumps their `version`, so it can't interleave with an edit, a cancel or
 * another invoice.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly cutoff: CutoffService,
  ) {}

  // ─────────────── reads ───────────────

  async companies(): Promise<BillingCompanyDto[]> {
    await this.cutoff.ensureProcessed();
    const [companies, unbilled, pending, outstanding] = await Promise.all([
      this.prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.order.groupBy({
        by: ['companyId'],
        where: { status: { in: [...BILLABLE] }, invoiceLine: { is: null } },
        _count: { _all: true },
        _sum: { totalCents: true },
        _min: { deliveryDate: true },
      }),
      this.prisma.billingAdjustment.groupBy({
        by: ['companyId'],
        where: { invoiceLine: { is: null } },
        _count: { _all: true },
        _sum: { amountCents: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['companyId'],
        where: { status: 'ISSUED' },
        _count: { _all: true },
        _sum: { totalCents: true },
      }),
    ]);
    const u = new Map(unbilled.map((r) => [r.companyId, r]));
    const p = new Map(pending.map((r) => [r.companyId, r]));
    const o = new Map(outstanding.map((r) => [r.companyId, r]));
    return companies.map((c) => ({
      id: c.id,
      name: c.name,
      unbilledOrders: u.get(c.id)?._count._all ?? 0,
      unbilledCents: u.get(c.id)?._sum.totalCents ?? 0,
      pendingAdjustments: p.get(c.id)?._count._all ?? 0,
      pendingAdjustmentCents: p.get(c.id)?._sum.amountCents ?? 0,
      outstandingInvoices: o.get(c.id)?._count._all ?? 0,
      outstandingCents: o.get(c.id)?._sum.totalCents ?? 0,
      oldestUnbilled: u.get(c.id)?._min.deliveryDate ? fromDbDate(u.get(c.id)!._min.deliveryDate!) : null,
    }));
  }

  /** Every confirmed/delivered order of the company not yet invoiced, plus pending adjustments (BIL-02). */
  async billable(companyId: string, q: BillableQuery): Promise<CompanyBillableDto> {
    await this.cutoff.ensureProcessed();
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, billingContactName: true, billingEmail: true },
    });
    if (!company) throw new NotFound('Company not found');
    const deliveryDate: Prisma.DateTimeFilter = {};
    if (q.deliveryFrom) deliveryDate.gte = dbDate(q.deliveryFrom);
    if (q.deliveryTo) deliveryDate.lte = dbDate(q.deliveryTo);

    const [orders, adjustments] = await Promise.all([
      this.prisma.order.findMany({
        where: { companyId, status: { in: [...BILLABLE] }, invoiceLine: { is: null }, ...(q.deliveryFrom || q.deliveryTo ? { deliveryDate } : {}) },
        select: { id: true, number: true, deliveryDate: true, status: true, totalCents: true, employee: { select: { name: true } } },
        orderBy: [{ deliveryDate: 'asc' }, { number: 'asc' }],
      }),
      this.prisma.billingAdjustment.findMany({
        where: { companyId, invoiceLine: { is: null } },
        select: { id: true, orderId: true, amountCents: true, reason: true, note: true, createdAt: true, order: { select: { number: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return {
      company,
      orders: orders.map((o) => ({
        id: o.id,
        number: o.number,
        deliveryDate: fromDbDate(o.deliveryDate),
        employeeName: o.employee.name,
        status: o.status as 'CONFIRMED' | 'DELIVERED',
        totalCents: o.totalCents,
      })),
      adjustments: adjustments.map((a) => ({
        id: a.id,
        orderId: a.orderId,
        orderNumber: a.order.number,
        amountCents: a.amountCents,
        reason: a.reason,
        note: a.note,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }

  async invoices(q: InvoiceListQuery): Promise<Paginated<InvoiceListItemDto>> {
    const where: Prisma.InvoiceWhereInput = {
      ...(q.companyId ? { companyId: q.companyId } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        select: INVOICE_LIST_SELECT,
        orderBy: { number: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { items: rows.map((r) => this.listItem(r)), page: q.page, pageSize: q.pageSize, total };
  }

  async invoice(id: string): Promise<InvoiceDetailDto> {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      select: {
        ...INVOICE_LIST_SELECT,
        billingSnapshot: true,
        notes: true,
        paymentReference: true,
        createdById: true,
        paidById: true,
        lines: {
          select: {
            id: true,
            orderId: true,
            adjustmentId: true,
            description: true,
            deliveryDate: true,
            amountCents: true,
            order: { select: { number: true } },
            adjustment: { select: { order: { select: { id: true, number: true } } } },
          },
        },
      },
    });
    if (!inv) throw new NotFound('Invoice not found');
    const staffIds = [inv.createdById, inv.paidById].filter((x): x is string => !!x);
    const staff = staffIds.length ? await this.prisma.staffUser.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } }) : [];
    const name = (sid: string | null) => (sid ? (staff.find((s) => s.id === sid)?.name ?? null) : null);
    const snap = inv.billingSnapshot as { companyName: string; contactName: string; email: string; phone: string | null; address: string };
    const lines = inv.lines
      .map((l) => ({
        id: l.id,
        kind: (l.orderId ? 'ORDER' : 'ADJUSTMENT') as 'ORDER' | 'ADJUSTMENT',
        orderId: l.orderId ?? l.adjustment?.order.id ?? null,
        orderNumber: l.order?.number ?? l.adjustment?.order.number ?? null,
        description: l.description,
        deliveryDate: l.deliveryDate ? fromDbDate(l.deliveryDate) : null,
        amountCents: l.amountCents,
      }))
      // Orders by delivery date then number; adjustments after the orders.
      .sort(
        (a, b) =>
          (a.kind === b.kind ? 0 : a.kind === 'ORDER' ? -1 : 1) ||
          (a.deliveryDate ?? '').localeCompare(b.deliveryDate ?? '') ||
          (a.orderNumber ?? 0) - (b.orderNumber ?? 0),
      );
    return {
      ...this.listItem(inv),
      billTo: snap,
      notes: inv.notes,
      paymentReference: inv.paymentReference,
      issuedBy: name(inv.createdById),
      paidBy: name(inv.paidById),
      lines,
      linesSumCents: invoiceTotal(lines.map((l) => l.amountCents)),
    };
  }

  // ─────────────── writes ───────────────

  /**
   * One transaction (BIL-03, BIL-05): lock the chosen orders and adjustments (in id order, so two
   * invoices can't deadlock), re-check them under the lock, snapshot amounts, total = Σ lines.
   * A second invoice for the same order waits for the first and then gets 409 ALREADY_INVOICED.
   */
  async createInvoice(input: CreateInvoiceInput, actor: AuthUser): Promise<InvoiceDetailDto> {
    await this.cutoff.ensureProcessed();
    const now = this.clock.now();
    const company = await this.prisma.company.findUnique({
      where: { id: input.companyId },
      select: { id: true, name: true, billingContactName: true, billingEmail: true, billingPhone: true, billingAddress: true },
    });
    if (!company) throw new NotFound('Company not found');
    const orderIds = [...input.orderIds].sort();
    const adjustmentIds = [...input.adjustmentIds].sort();

    try {
      const invoiceId = await this.prisma.$transaction(
        async (tx) => {
          if (orderIds.length) await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ANY(${orderIds}::uuid[]) ORDER BY "id" FOR UPDATE`;
          if (adjustmentIds.length) {
            await tx.$queryRaw`SELECT "id" FROM "BillingAdjustment" WHERE "id" = ANY(${adjustmentIds}::uuid[]) ORDER BY "id" FOR UPDATE`;
          }
          const [orders, adjustments] = await Promise.all([
            tx.order.findMany({
              where: { id: { in: orderIds } },
              select: {
                id: true,
                number: true,
                companyId: true,
                status: true,
                totalCents: true,
                deliveryDate: true,
                employee: { select: { name: true } },
                invoiceLine: { select: { invoice: { select: { number: true } } } },
              },
            }),
            tx.billingAdjustment.findMany({
              where: { id: { in: adjustmentIds } },
              select: {
                id: true,
                companyId: true,
                amountCents: true,
                reason: true,
                note: true,
                invoiceLine: { select: { id: true } },
                order: { select: { number: true, deliveryDate: true } },
              },
            }),
          ]);
          this.assertInvoiceable(input.companyId, orderIds, adjustmentIds, orders, adjustments);

          const lines: Prisma.InvoiceLineCreateWithoutInvoiceInput[] = [
            ...orders.map((o) => ({
              order: { connect: { id: o.id } },
              description: `${formatOrderNumber(o.number)} · ${o.employee.name}`,
              deliveryDate: o.deliveryDate,
              amountCents: o.totalCents,
            })),
            ...adjustments.map((a) => ({
              adjustment: { connect: { id: a.id } },
              description: `${ADJUSTMENT_REASON_LABELS[a.reason]} · ${formatOrderNumber(a.order.number)}${a.note ? ` · ${a.note}` : ''}`,
              deliveryDate: a.order.deliveryDate,
              amountCents: a.amountCents,
            })),
          ];
          const dates = orders.map((o) => o.deliveryDate.getTime()).concat(adjustments.map((a) => a.order.deliveryDate.getTime()));
          const invoice = await tx.invoice.create({
            data: {
              companyId: company.id,
              issuedAt: now,
              periodStart: new Date(Math.min(...dates)),
              periodEnd: new Date(Math.max(...dates)),
              totalCents: invoiceTotal(lines.map((l) => l.amountCents)),
              billingSnapshot: {
                companyName: company.name,
                contactName: company.billingContactName,
                email: company.billingEmail,
                phone: company.billingPhone,
                address: company.billingAddress,
              },
              notes: input.notes,
              createdById: actor.id,
              lines: { create: lines },
            },
            select: { id: true, number: true },
          });

          // Timeline + version bump on every order touched (so a concurrent edit or cancel re-reads).
          const touched = [...new Set([...orderIds, ...(await this.orderIdsOf(tx, adjustmentIds))])];
          await tx.order.updateMany({ where: { id: { in: touched } }, data: { version: { increment: 1 } } });
          await tx.orderEvent.createMany({
            data: touched.map((orderId) => ({ orderId, type: 'INVOICED' as const, actorId: actor.id, at: now, data: { invoiceId: invoice.id, number: invoice.number } })),
          });
          return invoice.id;
        },
        { timeout: 30_000 },
      );
      return this.invoice(invoiceId);
    } catch (err) {
      // Belt and braces: the unique index on InvoiceLine.orderId/adjustmentId (BIL-05).
      if (err instanceof Error && err.name === 'PrismaClientKnownRequestError' && (err as { code?: string }).code === 'P2002') {
        throw new StateConflict('ALREADY_INVOICED', 'Some of these items were invoiced a moment ago. Reload and try again.');
      }
      throw err;
    }
  }

  /** ISSUED → PAID by compare-and-set (BIL-04). */
  async markPaid(id: string, input: MarkPaidInput, actor: AuthUser): Promise<InvoiceDetailDto> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, select: { status: true, issuedAt: true } });
    if (!invoice) throw new NotFound('Invoice not found');
    const today = this.clock.today();
    const issuedOn = DateTime.fromJSDate(invoice.issuedAt, { zone: this.clock.zone }).toISODate()!;
    const paidOn = input.paidOn ?? today;
    if (paidOn > today) throw new RuleViolation('VALIDATION_FAILED', 'The payment date can’t be in the future.', [{ path: ['paidOn'], code: 'VALIDATION_FAILED', message: 'Pick today or an earlier date.' }]);
    if (paidOn < issuedOn) {
      throw new RuleViolation('VALIDATION_FAILED', 'The payment date can’t be before the invoice was issued.', [
        { path: ['paidOn'], code: 'VALIDATION_FAILED', message: `Pick ${issuedOn} or later.` },
      ]);
    }
    // A past date is recorded at noon kitchen time; today uses the actual moment.
    const paidAt = paidOn === today ? this.clock.now() : DateTime.fromISO(paidOn, { zone: this.clock.zone }).set({ hour: 12 }).toJSDate();
    const updated = await this.prisma.invoice.updateMany({
      where: { id, status: 'ISSUED' },
      data: { status: 'PAID', paidAt, paymentReference: input.reference || null, paidById: actor.id },
    });
    if (updated.count === 0) throw new StateConflict('INVALID_TRANSITION', 'This invoice is already marked paid.');
    return this.invoice(id);
  }

  /**
   * Manual credit (< 0) or debit (> 0) against a billable order, billed on the next invoice
   * (A-32). Credits can never take the order's net charge below zero.
   */
  async addAdjustment(orderId: string, input: CreateAdjustmentInput, actor: AuthUser): Promise<void> {
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
      if (rows.length === 0) throw new NotFound('Order not found');
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { companyId: true, status: true, totalCents: true, invoiceLine: { select: { amountCents: true } }, adjustments: { select: { amountCents: true } } },
      });
      if (!isBillable(order.status)) {
        throw new RuleViolation('INVALID_TRANSITION', 'Only confirmed or delivered orders can be adjusted.');
      }
      const base = order.invoiceLine?.amountCents ?? order.totalCents;
      const problem = checkAdjustment(input.amountCents, base, order.adjustments.map((a) => a.amountCents));
      if (problem) {
        const remaining = netBilled(base, order.adjustments.map((a) => a.amountCents));
        const message = `This credit is larger than what remains billed for the order (at most ${formatCents(remaining)}).`;
        throw new RuleViolation('CREDIT_EXCEEDS_BILLED', message, [{ path: ['amountCents'], code: 'CREDIT_EXCEEDS_BILLED', message }]);
      }
      await tx.billingAdjustment.create({
        data: { companyId: order.companyId, orderId, amountCents: input.amountCents, reason: input.reason, note: input.note, createdById: actor.id },
      });
      await tx.order.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
      await tx.orderEvent.create({
        data: { orderId, type: 'ADJUSTMENT_ADDED', actorId: actor.id, at: now, data: { amountCents: input.amountCents, reason: input.reason } },
      });
    });
  }

  /**
   * Called inside the cancel/reject transaction (A-32): bring what the company is charged for the
   * order back to zero. Invoiced → a credit for the net billed amount. Not invoiced but with
   * already-billed or pending adjustments → the opposite entry, so nothing is owed either way.
   */
  async settleOnVoid(
    tx: Tx,
    order: { id: string; companyId: string; invoicedCents: number | null; adjustmentsCents: number[] },
    target: 'CANCELLED' | 'REJECTED',
    reason: string,
    actorId: string,
    now: Date,
  ): Promise<void> {
    const net = netBilled(order.invoicedCents ?? 0, order.adjustmentsCents);
    if (net === 0) return;
    const invoiced = order.invoicedCents !== null;
    const verb = target === 'CANCELLED' ? 'cancelled' : 'rejected';
    await tx.billingAdjustment.create({
      data: {
        companyId: order.companyId,
        orderId: order.id,
        amountCents: -net,
        reason: invoiced ? (target === 'CANCELLED' ? 'CANCELLED_AFTER_INVOICE' : 'REJECTED_AFTER_INVOICE') : 'OTHER',
        note: invoiced ? reason : `Order ${verb} before invoicing; reverses its earlier adjustments. ${reason}`,
        createdById: actorId,
      },
    });
    await tx.orderEvent.create({ data: { orderId: order.id, type: 'ADJUSTMENT_ADDED', actorId, at: now, data: { amountCents: -net } } });
  }

  // ─────────────── helpers ───────────────

  private assertInvoiceable(
    companyId: string,
    orderIds: string[],
    adjustmentIds: string[],
    orders: { id: string; number: number; companyId: string; status: string; invoiceLine: { invoice: { number: number } } | null }[],
    adjustments: { id: string; companyId: string; invoiceLine: { id: string } | null }[],
  ): void {
    if (orders.length !== orderIds.length || adjustments.length !== adjustmentIds.length) throw new NotFound('Some selected items no longer exist. Reload and try again.');
    const issues: { path: (string | number)[]; code: string; message: string }[] = [];
    for (const o of orders) {
      const i = orderIds.indexOf(o.id);
      if (o.companyId !== companyId) issues.push({ path: ['orderIds', i], code: 'VALIDATION_FAILED', message: `${formatOrderNumber(o.number)} belongs to another company.` });
      else if (o.invoiceLine) {
        throw new StateConflict('ALREADY_INVOICED', `${formatOrderNumber(o.number)} is already on ${formatInvoiceNumber(o.invoiceLine.invoice.number)}. Reload and try again.`);
      } else if (!isBillable(o.status as never)) {
        issues.push({ path: ['orderIds', i], code: 'INVALID_TRANSITION', message: `${formatOrderNumber(o.number)} is ${o.status.toLowerCase()}, so it isn’t billable.` });
      }
    }
    for (const a of adjustments) {
      const i = adjustmentIds.indexOf(a.id);
      if (a.companyId !== companyId) issues.push({ path: ['adjustmentIds', i], code: 'VALIDATION_FAILED', message: 'An adjustment belongs to another company.' });
      else if (a.invoiceLine) throw new StateConflict('ALREADY_INVOICED', 'An adjustment was invoiced a moment ago. Reload and try again.');
    }
    if (issues.length) throw new RuleViolation('VALIDATION_FAILED', issues[0]!.message, issues);
  }

  private async orderIdsOf(tx: Tx, adjustmentIds: string[]): Promise<string[]> {
    if (!adjustmentIds.length) return [];
    const rows = await tx.billingAdjustment.findMany({ where: { id: { in: adjustmentIds } }, select: { orderId: true } });
    return rows.map((r) => r.orderId);
  }

  private listItem(r: Prisma.InvoiceGetPayload<{ select: typeof INVOICE_LIST_SELECT }>): InvoiceListItemDto {
    return {
      id: r.id,
      number: r.number,
      company: r.company,
      status: r.status,
      issuedAt: r.issuedAt.toISOString(),
      periodStart: r.periodStart ? fromDbDate(r.periodStart) : null,
      periodEnd: r.periodEnd ? fromDbDate(r.periodEnd) : null,
      totalCents: r.totalCents,
      lineCount: r._count.lines,
      paidAt: r.paidAt?.toISOString() ?? null,
    };
  }
}
