import { Injectable } from '@nestjs/common';
import {
  addDays,
  type CalendarDate,
  cutoffAt,
  dateRange,
  dbDate,
  deliveryDayStatus,
  fromDbDate,
} from '@fernleaf/domain';
import {
  type CalendarDayDto,
  type EmployeeMenuDto,
  type EmployeeSearchItemDto,
  minutesToTime,
  type OrderingContextDto,
} from '@fernleaf/shared';
import { ClockService } from '../../common/clock/clock.service';
import { NotFound, RuleViolation } from '../../common/errors/domain-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { MenuCatalogueService } from './menu-catalogue.service';
import { formatAddress, TIME_STEP_MINUTES } from './order-pipeline.service';

/** Read models that drive the order form: who, when, what (TRD §6.8). */
@Injectable()
export class OrderingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly settings: PlatformSettingsService,
    private readonly catalogue: MenuCatalogueService,
  ) {}

  async searchEmployees(q: string): Promise<EmployeeSearchItemDto[]> {
    const rows = await this.prisma.employee.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { company: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {},
      orderBy: [{ name: 'asc' }],
      take: 20,
      select: { id: true, name: true, email: true, company: { select: { id: true, name: true } } },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, companyId: r.company.id, companyName: r.company.name }));
  }

  async context(employeeId: string): Promise<OrderingContextDto> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        allergens: { include: { allergen: { select: { name: true } } } },
        dietaryPrefs: { include: { dietaryTag: { select: { name: true } } } },
        company: { include: { addresses: { where: { isActive: true }, orderBy: { label: 'asc' } } } },
      },
    });
    if (!employee) throw new NotFound('Employee not found');
    const { settings } = await this.settings.get();
    const company = employee.company;
    const [packaging, tier] = await Promise.all([
      this.prisma.packagingType.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.priceTier.findUnique({ where: { id: company.priceTierId ?? settings.defaultPriceTierId }, select: { name: true } }),
    ]);
    return {
      employee: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        canChooseAddress: employee.canChooseAddress,
        canChangeDeliveryTime: employee.canChangeDeliveryTime,
        canChangePackaging: employee.canChangePackaging,
        allergens: employee.allergens.map((a) => a.allergen.name),
        dietaryPreferences: employee.dietaryPrefs.map((d) => d.dietaryTag.name),
      },
      company: {
        id: company.id,
        name: company.name,
        tierName: tier?.name ?? '—',
        defaultDeliveryTime: minutesToTime(company.defaultDeliveryTime),
        dispatchLeadMinutes: company.dispatchLeadMinutes,
      },
      addresses: company.addresses.map((a) => ({ id: a.id, label: a.label, text: formatAddress(a), isDefault: a.id === company.defaultAddressId })),
      packagingTypes: packaging.map((p) => ({ id: p.id, name: p.name, isDefault: p.id === company.defaultPackagingTypeId })),
      deliveryWindow: {
        start: minutesToTime(settings.deliveryWindowStart),
        end: minutesToTime(settings.deliveryWindowEnd),
        stepMinutes: TIME_STEP_MINUTES,
      },
      today: this.clock.today(),
    };
  }

  /** Delivery calendar for an employee: deliverable? cut-off? locked? (COMP-03, CUT-01). */
  async calendar(employeeId: string, from?: CalendarDate, to?: CalendarDate): Promise<CalendarDayDto[]> {
    const start = from ?? this.clock.today();
    const end = to ?? addDays(start, 20);
    if (end < start || dateRange(start, end).length > 62) {
      throw new RuleViolation('VALIDATION_FAILED', 'Choose a range of at most 62 days.');
    }
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { company: { select: { workingDays: true, holidays: { select: { date: true } } } } },
    });
    if (!employee) throw new NotFound('Employee not found');
    const { kitchen, cutoff } = await this.settings.get();
    const companyCal = { workingDays: employee.company.workingDays, holidays: new Set(employee.company.holidays.map((h) => fromDbDate(h.date))) };
    const runs = await this.prisma.cutoffRun.findMany({
      where: { deliveryDate: { gte: dbDate(start), lte: dbDate(end) } },
      select: { deliveryDate: true },
    });
    const processed = new Set(runs.map((r) => fromDbDate(r.deliveryDate)));
    const now = this.clock.now();
    return dateRange(start, end).map((date) => {
      const at = cutoffAt(date, cutoff, kitchen, this.clock.zone);
      return {
        date,
        status: deliveryDayStatus(date, kitchen, companyCal),
        cutoffAt: at.toISOString(),
        locked: now >= at || processed.has(date),
      };
    });
  }

  async menuForEmployee(employeeId: string): Promise<EmployeeMenuDto> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { companyId: true } });
    if (!employee) throw new NotFound('Employee not found');
    return this.catalogue.toDto(await this.catalogue.forCompany(employee.companyId));
  }
}
