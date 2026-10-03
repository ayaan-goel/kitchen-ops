import { Injectable } from '@nestjs/common';
import { dbDate, fromDbDate } from '@fernleaf/domain';
import { minutesToTime, type SettingsDto, type SettingsUpdateInput, timeToMinutes } from '@fernleaf/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { NotFound } from '../../common/errors/domain-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MenuCatalogueService } from '../ordering/menu-catalogue.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { fail } from './companies.service';

/**
 * Platform settings and kitchen holidays (SET-01, SET-02). Saving invalidates the settings cache,
 * whose listeners recompute the cut-off schedule; dates already processed stay locked (A-05).
 */
@Injectable()
export class SettingsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly settings: PlatformSettingsService,
    private readonly catalogue: MenuCatalogueService,
  ) {}

  async get(): Promise<SettingsDto> {
    const [s, holidays] = await Promise.all([
      this.prisma.platformSettings.findUniqueOrThrow({ where: { id: 1 }, include: { defaultPriceTier: { select: { id: true, name: true } } } }),
      this.prisma.kitchenHoliday.findMany({ orderBy: { date: 'asc' } }),
    ]);
    const by = s.updatedById ? await this.prisma.staffUser.findUnique({ where: { id: s.updatedById }, select: { name: true } }) : null;
    return {
      kitchenTimeZone: this.clock.zone,
      kitchenWorkingDays: s.kitchenWorkingDays,
      cutoffTime: minutesToTime(s.cutoffTime),
      cutoffDaysBefore: s.cutoffDaysBefore,
      kitchenBufferMinutes: s.kitchenBufferMinutes,
      atRiskMinutes: s.atRiskMinutes,
      onTimeGraceMinutes: s.onTimeGraceMinutes,
      deliveryWindowStart: minutesToTime(s.deliveryWindowStart),
      deliveryWindowEnd: minutesToTime(s.deliveryWindowEnd),
      defaultPriceTier: s.defaultPriceTier,
      publicEmailDomains: s.publicEmailDomains,
      holidays: holidays.map((h) => ({ id: h.id, date: fromDbDate(h.date), name: h.name })),
      updatedAt: s.updatedAt.toISOString(),
      updatedBy: by?.name ?? null,
    };
  }

  async update(input: SettingsUpdateInput, actor: AuthUser): Promise<SettingsDto> {
    await this.prisma.platformSettings.update({
      where: { id: 1 },
      data: {
        kitchenWorkingDays: [...input.kitchenWorkingDays].sort(),
        cutoffTime: timeToMinutes(input.cutoffTime),
        cutoffDaysBefore: input.cutoffDaysBefore,
        kitchenBufferMinutes: input.kitchenBufferMinutes,
        atRiskMinutes: input.atRiskMinutes,
        onTimeGraceMinutes: input.onTimeGraceMinutes,
        deliveryWindowStart: timeToMinutes(input.deliveryWindowStart),
        deliveryWindowEnd: timeToMinutes(input.deliveryWindowEnd),
        publicEmailDomains: [...new Set(input.publicEmailDomains.map((d) => d.replace(/^@/, '')))].sort(),
        updatedById: actor.id,
      },
    });
    this.changed();
    return this.get();
  }

  async addHoliday(date: string, name: string): Promise<SettingsDto> {
    if (date < this.clock.today()) throw fail('VALIDATION_FAILED', 'date', 'Pick today or a later date.');
    if (await this.prisma.kitchenHoliday.findUnique({ where: { date: dbDate(date) } })) throw fail('VALIDATION_FAILED', 'date', 'That date is already a kitchen holiday.');
    await this.prisma.kitchenHoliday.create({ data: { date: dbDate(date), name } });
    this.changed();
    return this.get();
  }

  async removeHoliday(id: string): Promise<SettingsDto> {
    const removed = await this.prisma.kitchenHoliday.deleteMany({ where: { id } });
    if (removed.count === 0) throw new NotFound('Holiday not found');
    this.changed();
    return this.get();
  }

  private changed(): void {
    this.settings.invalidate();
    this.catalogue.invalidate();
  }
}
