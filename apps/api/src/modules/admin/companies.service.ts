import { Injectable } from '@nestjs/common';
import { dbDate, fromDbDate } from '@fernleaf/domain';
import {
  type AddressInput,
  type CompanyCreateInput,
  type CompanyDetailDto,
  type CompanyListItemDto,
  type CompanyUpdateInput,
  type ErrorCode,
  minutesToTime,
  timeToMinutes,
} from '@fernleaf/shared';
import { NotFound, RuleViolation } from '../../common/errors/domain-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { MenuCatalogueService } from '../ordering/menu-catalogue.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';

type Tx = Prisma.TransactionClient;

export const fail = (code: ErrorCode, field: string, message: string) => new RuleViolation(code, message, [{ path: [field], code, message }]);

/** "@Acme.COM", "jo@acme.com" or "https://acme.com" → "acme.com"; null if it isn't a domain. */
export function normaliseDomain(input: string): string | null {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^.*@/, '').replace(/^www\./, '');
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(d) ? d : null;
}

/**
 * Companies and their sub-resources (COMP-01…05, A-18, A-38). Domains are globally unique and never
 * a public mailbox provider, because the email domain is what ties an employee to a company.
 */
@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
    private readonly catalogue: MenuCatalogueService,
  ) {}

  async list(): Promise<CompanyListItemDto[]> {
    const [{ settings }, rows, tiers] = await Promise.all([
      this.settings.get(),
      this.prisma.company.findMany({
        orderBy: { name: 'asc' },
        include: {
          domains: { select: { domain: true } },
          owner: { select: { name: true } },
          defaultDriver: { select: { name: true } },
          _count: { select: { employees: true } },
        },
      }),
      this.prisma.priceTier.findMany({ select: { id: true, name: true } }),
    ]);
    const tierName = new Map(tiers.map((t) => [t.id, t.name]));
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      tierName: tierName.get(c.priceTierId ?? settings.defaultPriceTierId) ?? '?',
      usesDefaultTier: c.priceTierId === null,
      domains: c.domains.map((d) => d.domain),
      employees: c._count.employees,
      ownerName: c.owner?.name ?? null,
      defaultDriverName: c.defaultDriver?.name ?? null,
      workingDays: c.workingDays,
    }));
  }

  async get(id: string): Promise<CompanyDetailDto> {
    const c = await this.prisma.company.findUnique({
      where: { id },
      include: {
        owner: { select: { name: true } },
        domains: { orderBy: { domain: 'asc' } },
        addresses: { orderBy: [{ isActive: 'desc' }, { label: 'asc' }] },
        holidays: { orderBy: { date: 'asc' } },
        hiddenCategories: { select: { categoryId: true } },
        hiddenMenuItems: { select: { menuItemId: true } },
        _count: { select: { employees: true } },
      },
    });
    if (!c) throw new NotFound('Company not found');
    const emails = await this.prisma.employee.findMany({ where: { companyId: id }, select: { email: true } });
    const perDomain = (domain: string) => emails.filter((e) => e.email.endsWith(`@${domain}`)).length;
    return {
      id: c.id,
      name: c.name,
      billingContactName: c.billingContactName,
      billingEmail: c.billingEmail,
      billingPhone: c.billingPhone,
      billingAddress: c.billingAddress,
      priceTierId: c.priceTierId,
      ownerEmployeeId: c.ownerEmployeeId,
      ownerName: c.owner?.name ?? null,
      workingDays: c.workingDays,
      defaultDeliveryTime: minutesToTime(c.defaultDeliveryTime),
      dispatchLeadMinutes: c.dispatchLeadMinutes,
      defaultPackagingTypeId: c.defaultPackagingTypeId,
      driverInstructions: c.driverInstructions,
      defaultDriverId: c.defaultDriverId,
      defaultAddressId: c.defaultAddressId,
      domains: c.domains.map((d) => ({ id: d.id, domain: d.domain, employees: perDomain(d.domain) })),
      addresses: c.addresses.map((a) => ({
        id: a.id,
        label: a.label,
        line1: a.line1,
        line2: a.line2,
        city: a.city,
        state: a.state,
        postalCode: a.postalCode,
        deliveryNotes: a.deliveryNotes,
        isActive: a.isActive,
        isDefault: a.id === c.defaultAddressId,
      })),
      holidays: c.holidays.map((h) => ({ id: h.id, date: fromDbDate(h.date), name: h.name })),
      hiddenCategoryIds: c.hiddenCategories.map((h) => h.categoryId),
      hiddenMenuItemIds: c.hiddenMenuItems.map((h) => h.menuItemId),
      employees: c._count.employees,
    };
  }

  /** A company starts with its first domain; the owner is set once it has employees (A-38). */
  async create(input: Required<CompanyCreateInput>): Promise<CompanyDetailDto> {
    const domain = await this.checkDomain(input.domain);
    const packaging = await this.prisma.packagingType.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    if (!packaging) throw new RuleViolation('VALIDATION_FAILED', 'Create a packaging type first (Reference data).');
    if (await this.prisma.company.findUnique({ where: { name: input.name }, select: { id: true } })) throw fail('VALIDATION_FAILED', 'name', 'A company with this name already exists.');
    const company = await this.prisma.company.create({
      data: {
        name: input.name,
        billingContactName: input.billingContactName,
        billingEmail: input.billingEmail,
        defaultDeliveryTime: 12 * 60 + 30,
        defaultPackagingTypeId: packaging.id,
        domains: { create: { domain } },
      },
    });
    return this.get(company.id);
  }

  async update(id: string, input: CompanyUpdateInput & { billingPhone: string | null; billingAddress: string; driverInstructions: string }): Promise<CompanyDetailDto> {
    const existing = await this.prisma.company.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFound('Company not found');
    const { settings } = await this.settings.get();
    const time = timeToMinutes(input.defaultDeliveryTime);
    if (time < settings.deliveryWindowStart || time > settings.deliveryWindowEnd) {
      throw fail('TIME_OUTSIDE_WINDOW', 'defaultDeliveryTime', `Pick a time between ${minutesToTime(settings.deliveryWindowStart)} and ${minutesToTime(settings.deliveryWindowEnd)}.`);
    }
    if (input.ownerEmployeeId) {
      const owner = await this.prisma.employee.findUnique({ where: { id: input.ownerEmployeeId }, select: { companyId: true } });
      if (!owner || owner.companyId !== id) throw fail('OWNER_NOT_EMPLOYEE', 'ownerEmployeeId', 'The owner must be one of this company’s employees.');
    }
    if (input.defaultDriverId) {
      const driver = await this.prisma.staffUser.findFirst({ where: { id: input.defaultDriverId, isActive: true, role: { permissions: { has: 'deliveries.own' } } } });
      if (!driver) throw fail('VALIDATION_FAILED', 'defaultDriverId', 'Choose an active staff member who can deliver.');
    }
    if (input.priceTierId && !(await this.prisma.priceTier.findUnique({ where: { id: input.priceTierId }, select: { id: true } }))) {
      throw fail('VALIDATION_FAILED', 'priceTierId', 'Unknown price tier.');
    }
    const packaging = await this.prisma.packagingType.findUnique({ where: { id: input.defaultPackagingTypeId } });
    if (!packaging) throw fail('VALIDATION_FAILED', 'defaultPackagingTypeId', 'Unknown packaging type.');
    const clash = await this.prisma.company.findFirst({ where: { name: input.name, id: { not: id } }, select: { id: true } });
    if (clash) throw fail('VALIDATION_FAILED', 'name', 'A company with this name already exists.');

    await this.prisma.company.update({
      where: { id },
      data: {
        name: input.name,
        billingContactName: input.billingContactName,
        billingEmail: input.billingEmail,
        billingPhone: input.billingPhone,
        billingAddress: input.billingAddress,
        priceTierId: input.priceTierId,
        ownerEmployeeId: input.ownerEmployeeId,
        workingDays: [...input.workingDays].sort(),
        defaultDeliveryTime: time,
        dispatchLeadMinutes: input.dispatchLeadMinutes,
        defaultPackagingTypeId: input.defaultPackagingTypeId,
        driverInstructions: input.driverInstructions,
        defaultDriverId: input.defaultDriverId,
      },
    });
    this.catalogue.invalidate(); // tier or visibility may have changed what employees can order
    return this.get(id);
  }

  // ─── domains ───

  async addDomain(id: string, raw: string): Promise<CompanyDetailDto> {
    await this.mustExist(id);
    const domain = await this.checkDomain(raw);
    await this.prisma.companyDomain.create({ data: { companyId: id, domain } });
    return this.get(id);
  }

  async removeDomain(id: string, domainId: string): Promise<CompanyDetailDto> {
    const domains = await this.prisma.companyDomain.findMany({ where: { companyId: id } });
    const target = domains.find((d) => d.id === domainId);
    if (!target) throw new NotFound('Domain not found');
    if (domains.length === 1) throw fail('IN_USE', 'domainId', 'A company needs at least one domain.');
    const users = await this.prisma.employee.count({ where: { companyId: id, email: { endsWith: `@${target.domain}` } } });
    if (users > 0) throw fail('IN_USE', 'domainId', `${users} employees use @${target.domain}. Move or update them first.`);
    await this.prisma.companyDomain.delete({ where: { id: domainId } });
    return this.get(id);
  }

  private async checkDomain(raw: string): Promise<string> {
    const domain = normaliseDomain(raw);
    if (!domain) throw fail('VALIDATION_FAILED', 'domain', 'Enter a domain like acme.com.');
    const { settings } = await this.settings.get();
    if (settings.publicEmailDomains.includes(domain)) {
      throw fail('PUBLIC_DOMAIN', 'domain', `${domain} is a public email provider, so it can’t identify a company. Use the company’s own domain.`);
    }
    const taken = await this.prisma.companyDomain.findUnique({ where: { domain }, include: { company: { select: { name: true } } } });
    if (taken) throw fail('DOMAIN_TAKEN', 'domain', `${domain} already belongs to ${taken.company.name}.`);
    return domain;
  }

  // ─── addresses (exactly one default, A-19) ───

  async addAddress(id: string, input: Required<AddressInput>): Promise<CompanyDetailDto> {
    const company = await this.prisma.company.findUnique({ where: { id }, select: { defaultAddressId: true } });
    if (!company) throw new NotFound('Company not found');
    await this.prisma.$transaction(async (tx) => {
      const { makeDefault, ...data } = input;
      const address = await tx.companyAddress.create({ data: { ...data, isActive: true, companyId: id } });
      if (makeDefault || !company.defaultAddressId) await tx.company.update({ where: { id }, data: { defaultAddressId: address.id } });
    });
    return this.get(id);
  }

  async updateAddress(id: string, addressId: string, input: Required<AddressInput>): Promise<CompanyDetailDto> {
    const company = await this.prisma.company.findUnique({ where: { id }, include: { addresses: { select: { id: true, isActive: true } } } });
    if (!company) throw new NotFound('Company not found');
    if (!company.addresses.some((a) => a.id === addressId)) throw new NotFound('Address not found');
    const { makeDefault, ...data } = input;
    const isDefault = company.defaultAddressId === addressId;
    if (!data.isActive && isDefault) throw fail('VALIDATION_FAILED', 'isActive', 'Make another address the default before deactivating this one.');
    if (!data.isActive && company.addresses.filter((a) => a.isActive && a.id !== addressId).length === 0) {
      throw fail('VALIDATION_FAILED', 'isActive', 'A company needs at least one active address.');
    }
    if (makeDefault && !data.isActive) throw fail('VALIDATION_FAILED', 'makeDefault', 'An inactive address can’t be the default.');
    await this.prisma.$transaction(async (tx: Tx) => {
      await tx.companyAddress.update({ where: { id: addressId }, data });
      if (makeDefault) await tx.company.update({ where: { id }, data: { defaultAddressId: addressId } });
    });
    return this.get(id);
  }

  // ─── calendar ───

  async addHoliday(id: string, date: string, name: string): Promise<CompanyDetailDto> {
    await this.mustExist(id);
    const exists = await this.prisma.companyHoliday.findUnique({ where: { companyId_date: { companyId: id, date: dbDate(date) } } });
    if (exists) throw fail('VALIDATION_FAILED', 'date', 'That date is already a holiday.');
    await this.prisma.companyHoliday.create({ data: { companyId: id, date: dbDate(date), name } });
    return this.get(id);
  }

  async removeHoliday(id: string, holidayId: string): Promise<CompanyDetailDto> {
    const removed = await this.prisma.companyHoliday.deleteMany({ where: { id: holidayId, companyId: id } });
    if (removed.count === 0) throw new NotFound('Holiday not found');
    return this.get(id);
  }

  // ─── menu visibility (MENU-02) ───

  async setVisibility(id: string, input: { hiddenCategoryIds: string[]; hiddenMenuItemIds: string[] }): Promise<CompanyDetailDto> {
    await this.mustExist(id);
    await this.prisma.$transaction([
      this.prisma.companyHiddenCategory.deleteMany({ where: { companyId: id } }),
      this.prisma.companyHiddenMenuItem.deleteMany({ where: { companyId: id } }),
      this.prisma.companyHiddenCategory.createMany({ data: [...new Set(input.hiddenCategoryIds)].map((categoryId) => ({ companyId: id, categoryId })) }),
      this.prisma.companyHiddenMenuItem.createMany({ data: [...new Set(input.hiddenMenuItemIds)].map((menuItemId) => ({ companyId: id, menuItemId })) }),
    ]);
    this.catalogue.invalidate();
    return this.get(id);
  }

  private async mustExist(id: string): Promise<void> {
    if (!(await this.prisma.company.findUnique({ where: { id }, select: { id: true } }))) throw new NotFound('Company not found');
  }
}
