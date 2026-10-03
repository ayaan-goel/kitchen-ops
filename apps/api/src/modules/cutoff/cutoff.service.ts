import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import {
  addDays,
  type CalendarDate,
  cutoffAt,
  dateRange,
  dbDate,
  fromDbDate,
  latestLockedDate,
  nextCutoffInstant,
} from '@fernleaf/domain';
import type { CutoffDayDto, CutoffRunResultDto } from '@fernleaf/shared';
import { ClockService } from '../../common/clock/clock.service';
import { RuleViolation } from '../../common/errors/domain-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CutoffTrigger } from '../../generated/prisma/client';
import { DropService } from '../dispatch/drop.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';

const AUTO_CANCEL_REASON = 'Auto-cancelled at cut-off';

/**
 * Cut-off processing (CUT-01…05, A-04…A-07). For a delivery date whose cut-off has passed:
 * drafts → CANCELLED, placed → CONFIRMED (billable) and grouped into drops.
 * Idempotent (compare-and-set updates + CutoffRun upsert) and serialised per date with a
 * Postgres advisory lock, so the scheduler, lazy catch-up and the admin console can never collide.
 */
@Injectable()
export class CutoffService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CutoffService.name);
  /** In-memory: before this instant nothing can be due, so checks don't touch the DB. */
  private nextDueAt: Date | null = null;
  private inflight: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly settings: PlatformSettingsService,
    private readonly drops: DropService,
  ) {
    this.settings.onChange(() => {
      this.nextDueAt = null; // settings/holidays changed: recompute on the next check
    });
  }

  onApplicationBootstrap(): void {
    // Catch up after a restart without blocking boot.
    void this.ensureProcessed('SCHEDULED').catch((err: unknown) => this.logger.error({ err }, 'Boot cut-off catch-up failed'));
  }

  /**
   * Lazy guarantee used before any read/write that depends on order statuses (A-06):
   * if a cut-off may have passed since the last check, process every due date first.
   */
  async ensureProcessed(trigger: CutoffTrigger = 'ON_DEMAND'): Promise<void> {
    if (this.nextDueAt && this.clock.now() < this.nextDueAt) return;
    this.inflight ??= this.processDue(trigger).finally(() => {
      this.inflight = null;
    });
    await this.inflight;
  }

  /** Processes every due date now, ignoring the in-memory "nothing due before" shortcut (demo generator). */
  async catchUp(trigger: CutoffTrigger = 'SCHEDULED'): Promise<void> {
    await this.inflight;
    this.nextDueAt = null;
    await this.ensureProcessed(trigger);
  }

  /** Cheap check for the 60 s scheduler tick: no DB access unless something is due. */
  isDue(): boolean {
    return !this.nextDueAt || this.clock.now() >= this.nextDueAt;
  }

  async cutoffFor(date: CalendarDate): Promise<{ cutoffAt: Date; locked: boolean }> {
    const { kitchen, cutoff } = await this.settings.get();
    const at = cutoffAt(date, cutoff, kitchen, this.clock.zone);
    if (this.clock.now() >= at) return { cutoffAt: at, locked: true };
    // A future date can still be locked if an admin closed it early (A-05/A-06).
    const run = await this.prisma.cutoffRun.findUnique({ where: { deliveryDate: dbDate(date) }, select: { id: true } });
    return { cutoffAt: at, locked: run !== null };
  }

  private async processDue(trigger: CutoffTrigger): Promise<void> {
    const { kitchen, cutoff } = await this.settings.get();
    const now = this.clock.now();
    const latest = latestLockedDate(now, cutoff, kitchen, this.clock.zone);
    const due = await this.prisma.order.groupBy({
      by: ['deliveryDate'],
      where: { status: { in: ['DRAFT', 'PLACED'] }, deliveryDate: { lte: dbDate(latest) } },
    });
    for (const row of due.sort((a, b) => a.deliveryDate.getTime() - b.deliveryDate.getTime())) {
      await this.processDate(fromDbDate(row.deliveryDate), trigger, null);
    }
    this.nextDueAt = nextCutoffInstant(now, cutoff, kitchen, this.clock.zone);
  }

  /** Processes one delivery date. Safe to call any number of times (CUT-04). */
  async processDate(date: CalendarDate, trigger: CutoffTrigger, actorId: string | null): Promise<CutoffRunResultDto> {
    const { kitchen, cutoff } = await this.settings.get();
    const at = cutoffAt(date, cutoff, kitchen, this.clock.zone);
    const now = this.clock.now();

    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cutoff:${date}`}))`;

        const cancelled = await tx.$queryRaw<{ id: string }[]>`
          UPDATE "Order"
             SET "status" = 'CANCELLED', "cancelledAt" = ${now}, "statusReason" = ${AUTO_CANCEL_REASON},
                 "version" = "version" + 1, "updatedAt" = ${now}
           WHERE "deliveryDate" = ${date}::date AND "status" = 'DRAFT'
       RETURNING "id"`;
        const confirmed = await tx.$queryRaw<{ id: string }[]>`
          UPDATE "Order"
             SET "status" = 'CONFIRMED', "confirmedAt" = ${now}, "version" = "version" + 1, "updatedAt" = ${now}
           WHERE "deliveryDate" = ${date}::date AND "status" = 'PLACED'
       RETURNING "id"`;

        await tx.orderEvent.createMany({
          data: [
            ...cancelled.map((o) => ({ orderId: o.id, type: 'CANCELLED' as const, actorId, at: now, data: { reason: AUTO_CANCEL_REASON, trigger } })),
            ...confirmed.map((o) => ({ orderId: o.id, type: 'CONFIRMED' as const, actorId, at: now, data: { trigger } })),
          ],
        });
        await this.drops.attachMany(tx, confirmed.map((o) => o.id), actorId);

        const run = await tx.cutoffRun.upsert({
          where: { deliveryDate: dbDate(date) },
          create: {
            deliveryDate: dbDate(date),
            cutoffAt: at,
            trigger,
            triggeredById: actorId,
            confirmedCount: confirmed.length,
            cancelledCount: cancelled.length,
            firstRunAt: now,
            lastRunAt: now,
          },
          update: {
            runCount: { increment: 1 },
            lastRunAt: now,
            confirmedCount: { increment: confirmed.length },
            cancelledCount: { increment: cancelled.length },
          },
        });
        return { confirmed: confirmed.length, cancelled: cancelled.length, runCount: run.runCount };
      },
      { timeout: 120_000, maxWait: 20_000 },
    );

    if (result.confirmed + result.cancelled > 0) {
      this.logger.log({ date, trigger, ...result }, 'Cut-off processed');
    }
    return { date, ...result };
  }

  /** Admin console action (CUT-05): run a past cut-off, or explicitly close a future date early. */
  async runManually(date: CalendarDate, closeEarly: boolean, actorId: string): Promise<CutoffRunResultDto> {
    const { cutoffAt: at } = await this.cutoffFor(date);
    const isFuture = this.clock.now() < at;
    if (isFuture && !closeEarly) {
      throw new RuleViolation(
        'VALIDATION_FAILED',
        'This date’s cut-off has not passed yet. Use “Close ordering now” to process it early.',
        [{ path: ['closeEarly'], code: 'VALIDATION_FAILED', message: 'Confirm closing ordering early.' }],
      );
    }
    return this.processDate(date, isFuture ? 'CLOSE_EARLY' : 'MANUAL', actorId);
  }

  /** Cut-off console rows (A-06). */
  async listDays(from: CalendarDate, to: CalendarDate): Promise<CutoffDayDto[]> {
    await this.ensureProcessed();
    const { kitchen, cutoff } = await this.settings.get();
    const now = this.clock.now();
    const [counts, runs] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['deliveryDate', 'status'],
        where: { deliveryDate: { gte: dbDate(from), lte: dbDate(to) }, status: { in: ['DRAFT', 'PLACED', 'CONFIRMED'] } },
        _count: { _all: true },
      }),
      this.prisma.cutoffRun.findMany({ where: { deliveryDate: { gte: dbDate(from), lte: dbDate(to) } } }),
    ]);
    const runByDate = new Map(runs.map((r) => [fromDbDate(r.deliveryDate), r]));

    return dateRange(from, to).map((date) => {
      const c = { draft: 0, placed: 0, confirmed: 0 };
      for (const row of counts) {
        if (fromDbDate(row.deliveryDate) !== date) continue;
        if (row.status === 'DRAFT') c.draft = row._count._all;
        if (row.status === 'PLACED') c.placed = row._count._all;
        if (row.status === 'CONFIRMED') c.confirmed = row._count._all;
      }
      const at = cutoffAt(date, cutoff, kitchen, this.clock.zone);
      const run = runByDate.get(date);
      const passed = now >= at;
      const state: CutoffDayDto['state'] = run
        ? 'PROCESSED'
        : passed && c.draft + c.placed > 0
          ? 'DUE'
          : passed
            ? 'LOCKED'
            : 'OPEN';
      return {
        date,
        cutoffAt: at.toISOString(),
        state,
        counts: c,
        lastRun: run ? { at: run.lastRunAt.toISOString(), runCount: run.runCount, trigger: run.trigger } : null,
      };
    });
  }

  /** Default console window: from yesterday for two weeks. */
  defaultWindow(): { from: CalendarDate; to: CalendarDate } {
    const today = this.clock.today();
    return { from: addDays(today, -1), to: addDays(today, 13) };
  }
}
