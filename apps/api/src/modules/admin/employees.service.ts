import { Injectable } from '@nestjs/common';
import { fromDbDate } from '@fernleaf/domain';
import type { EmployeeDetailDto, EmployeeImportReportDto, EmployeeInput, EmployeeListItemDto, EmployeeListQuery, Paginated } from '@fernleaf/shared';
import { NotFound } from '../../common/errors/domain-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { fail } from './companies.service';

type Parsed = Required<EmployeeInput> & { phone: string | null };

const OPEN = ['DRAFT', 'PLACED'] as const;

/**
 * Employees (EMP-01…04). An employee belongs to exactly one company and their email must be on one
 * of its domains (A-18). Moving keeps past orders with the old company (billing follows the order).
 */
@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: EmployeeListQuery): Promise<Paginated<EmployeeListItemDto>> {
    const where: Prisma.EmployeeWhereInput = {
      ...(q.companyId ? { companyId: q.companyId } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        include: { company: { select: { id: true, name: true } }, ownerOf: { select: { id: true } }, _count: { select: { allergens: true } } },
        orderBy: [{ company: { name: 'asc' } }, { name: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.employee.count({ where }),
    ]);
    return {
      items: rows.map((e) => ({
        id: e.id,
        name: e.name,
        email: e.email,
        company: e.company,
        isOwner: !!e.ownerOf,
        flags: { address: e.canChooseAddress, time: e.canChangeDeliveryTime, packaging: e.canChangePackaging },
        allergies: e._count.allergens,
      })),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  async get(id: string): Promise<EmployeeDetailDto> {
    const e = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        company: { select: { name: true } },
        ownerOf: { select: { id: true } },
        allergens: { select: { allergenId: true } },
        dietaryPrefs: { select: { dietaryTagId: true } },
        _count: { select: { orders: true } },
        orders: {
          where: { status: { in: [...OPEN] } },
          select: { id: true, number: true, deliveryDate: true, status: true, company: { select: { name: true } } },
          orderBy: { deliveryDate: 'asc' },
        },
      },
    });
    if (!e) throw new NotFound('Employee not found');
    return {
      id: e.id,
      companyId: e.companyId,
      companyName: e.company.name,
      name: e.name,
      email: e.email,
      phone: e.phone,
      canChooseAddress: e.canChooseAddress,
      canChangeDeliveryTime: e.canChangeDeliveryTime,
      canChangePackaging: e.canChangePackaging,
      allergenIds: e.allergens.map((a) => a.allergenId),
      dietaryTagIds: e.dietaryPrefs.map((d) => d.dietaryTagId),
      isOwner: !!e.ownerOf,
      orderCount: e._count.orders,
      openOrders: e.orders.map((o) => ({ id: o.id, number: o.number, deliveryDate: fromDbDate(o.deliveryDate), status: o.status, companyName: o.company.name })),
    };
  }

  async create(input: Parsed): Promise<EmployeeDetailDto> {
    await this.checkEmail(input.companyId, input.email);
    const e = await this.prisma.employee.create({ data: this.data(input) });
    return this.get(e.id);
  }

  async update(id: string, input: Parsed): Promise<EmployeeDetailDto> {
    const existing = await this.prisma.employee.findUnique({ where: { id }, select: { companyId: true } });
    if (!existing) throw new NotFound('Employee not found');
    if (input.companyId !== existing.companyId) throw fail('VALIDATION_FAILED', 'companyId', 'Use “Move to another company” to change the company.');
    await this.checkEmail(existing.companyId, input.email, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.employeeAllergen.deleteMany({ where: { employeeId: id } });
      await tx.employeeDietaryPreference.deleteMany({ where: { employeeId: id } });
      await tx.employee.update({ where: { id }, data: this.data(input) });
    });
    return this.get(id);
  }

  /**
   * Moves an employee to another company with a new email on that company's domains. Their past
   * orders stay with the old company; open ones can then only be cancelled (A-18).
   */
  async move(id: string, companyId: string, email: string): Promise<EmployeeDetailDto> {
    const e = await this.prisma.employee.findUnique({ where: { id }, include: { ownerOf: { select: { name: true } } } });
    if (!e) throw new NotFound('Employee not found');
    if (e.companyId === companyId) throw fail('VALIDATION_FAILED', 'companyId', 'They already work for this company.');
    if (e.ownerOf) throw fail('VALIDATION_FAILED', 'companyId', `${e.name} is the owner of ${e.ownerOf.name}. Choose another owner first.`);
    await this.checkEmail(companyId, email, id);
    await this.prisma.employee.update({ where: { id }, data: { companyId, email } });
    return this.get(id);
  }

  /**
   * [S] CSV import (EMP-04): every row is validated; a dry run only reports. A real run inserts the
   * valid rows in one transaction and reports the rest. Columns:
   * name,email,phone,allergies,dietary,can_choose_address,can_change_time,can_change_packaging
   */
  async import(companyId: string, csv: string, dryRun: boolean): Promise<EmployeeImportReportDto> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, include: { domains: true } });
    if (!company) throw new NotFound('Company not found');
    const [allergens, tags] = await Promise.all([this.prisma.allergen.findMany(), this.prisma.dietaryTag.findMany()]);
    const allergenByName = new Map(allergens.map((a) => [a.name.toLowerCase(), a.id]));
    const tagByName = new Map(tags.map((t) => [t.name.toLowerCase(), t.id]));
    const domains = new Set(company.domains.map((d) => d.domain));

    const table = parseCsv(csv);
    const header = (table.shift() ?? []).map((h) => h.trim().toLowerCase());
    const col = (name: string) => header.indexOf(name);
    for (const required of ['name', 'email']) {
      if (col(required) < 0) throw fail('VALIDATION_FAILED', 'file', `The first row must be a header with at least “name” and “email” columns.`);
    }
    if (table.length > 2000) throw fail('VALIDATION_FAILED', 'file', 'At most 2,000 rows per file.');

    const emails = table.map((r) => (r[col('email')] ?? '').trim().toLowerCase()).filter(Boolean);
    const existing = new Set((await this.prisma.employee.findMany({ where: { email: { in: emails } }, select: { email: true } })).map((e) => e.email));
    const seen = new Set<string>();
    const bool = (v: string | undefined) => /^(yes|y|true|1)$/i.test((v ?? '').trim());
    const list = (v: string | undefined) => (v ?? '').split(';').map((s) => s.trim()).filter(Boolean);

    const report: EmployeeImportReportDto = { dryRun, total: table.length, valid: 0, invalid: 0, created: 0, rows: [] };
    const valid: Parsed[] = [];
    table.forEach((r, i) => {
      const errors: { column: string; message: string }[] = [];
      const name = (r[col('name')] ?? '').trim();
      const email = (r[col('email')] ?? '').trim().toLowerCase();
      if (!name) errors.push({ column: 'name', message: 'Required' });
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push({ column: 'email', message: 'Not a valid email' });
      else if (!domains.has(email.split('@')[1]!)) errors.push({ column: 'email', message: `Must be on ${[...domains].map((d) => `@${d}`).join(' or ')}` });
      else if (existing.has(email)) errors.push({ column: 'email', message: 'Already exists' });
      else if (seen.has(email)) errors.push({ column: 'email', message: 'Appears twice in this file' });
      seen.add(email);
      const allergenIds: string[] = [];
      for (const a of list(r[col('allergies')])) {
        const id = allergenByName.get(a.toLowerCase());
        if (id) allergenIds.push(id);
        else errors.push({ column: 'allergies', message: `Unknown allergen “${a}”` });
      }
      const dietaryTagIds: string[] = [];
      for (const t of list(r[col('dietary')])) {
        const id = tagByName.get(t.toLowerCase());
        if (id) dietaryTagIds.push(id);
        else errors.push({ column: 'dietary', message: `Unknown dietary tag “${t}”` });
      }
      if (errors.length) {
        report.invalid++;
        report.rows.push({ row: i + 2, email, errors });
        return;
      }
      report.valid++;
      valid.push({
        companyId,
        name,
        email,
        phone: (r[col('phone')] ?? '').trim() || null,
        canChooseAddress: bool(r[col('can_choose_address')]),
        canChangeDeliveryTime: bool(r[col('can_change_time')]),
        canChangePackaging: bool(r[col('can_change_packaging')]),
        allergenIds: [...new Set(allergenIds)],
        dietaryTagIds: [...new Set(dietaryTagIds)],
      });
    });

    if (!dryRun && valid.length > 0) {
      await this.prisma.$transaction(
        async (tx) => {
          for (const v of valid) await tx.employee.create({ data: this.data(v) });
        },
        { timeout: 60_000 },
      );
      report.created = valid.length;
    }
    return report;
  }

  private async checkEmail(companyId: string, email: string, selfId?: string): Promise<void> {
    const domains = await this.prisma.companyDomain.findMany({ where: { companyId }, select: { domain: true } });
    if (domains.length === 0) throw new NotFound('Company not found');
    const domain = email.split('@')[1] ?? '';
    if (!domains.some((d) => d.domain === domain)) {
      throw fail('EMAIL_DOMAIN_MISMATCH', 'email', `The email must end in ${domains.map((d) => `@${d.domain}`).join(' or ')}.`);
    }
    const taken = await this.prisma.employee.findUnique({ where: { email }, select: { id: true } });
    if (taken && taken.id !== selfId) throw fail('VALIDATION_FAILED', 'email', 'Another employee already uses this email.');
  }

  private data(input: Parsed) {
    return {
      companyId: input.companyId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      canChooseAddress: input.canChooseAddress,
      canChangeDeliveryTime: input.canChangeDeliveryTime,
      canChangePackaging: input.canChangePackaging,
      allergens: { create: input.allergenIds.map((allergenId) => ({ allergenId })) },
      dietaryPrefs: { create: input.dietaryTagIds.map((dietaryTagId) => ({ dietaryTagId })) },
    };
  }
}

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF/LF. Blank lines are skipped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip a UTF-8 BOM
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}
