import { Injectable } from '@nestjs/common';
import { type CutoffSettings, fromDbDate, type WorkingCalendar } from '@fernleaf/domain';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PlatformSettings } from '../../generated/prisma/client';

export interface PlatformState {
  settings: PlatformSettings;
  kitchen: WorkingCalendar;
  cutoff: CutoffSettings;
}

type Listener = () => void;

/**
 * Cached platform settings + kitchen calendar. The cache lives until a settings/holiday change
 * invalidates it, so the cut-off scheduler can run without querying the DB (TRD §6.9).
 * Single API instance (ADR-003), so an in-memory cache is safe.
 */
@Injectable()
export class PlatformSettingsService {
  private cached: Promise<PlatformState> | null = null;
  private readonly listeners: Listener[] = [];

  constructor(private readonly prisma: PrismaService) {}

  get(): Promise<PlatformState> {
    this.cached ??= this.load().catch((err: unknown) => {
      this.cached = null;
      throw err;
    });
    return this.cached;
  }

  /** Call after any settings or kitchen-holiday change. */
  invalidate(): void {
    this.cached = null;
    for (const listener of this.listeners) listener();
  }

  onChange(listener: Listener): void {
    this.listeners.push(listener);
  }

  private async load(): Promise<PlatformState> {
    const [settings, holidays] = await Promise.all([
      this.prisma.platformSettings.findUnique({ where: { id: 1 } }),
      this.prisma.kitchenHoliday.findMany({ select: { date: true } }),
    ]);
    if (!settings) throw new Error('Platform settings are missing. Run the seed (pnpm --filter @fernleaf/api db:seed).');
    return {
      settings,
      kitchen: { workingDays: settings.kitchenWorkingDays, holidays: new Set(holidays.map((h) => fromDbDate(h.date))) },
      cutoff: { cutoffDaysBefore: settings.cutoffDaysBefore, cutoffTime: settings.cutoffTime },
    };
  }
}
