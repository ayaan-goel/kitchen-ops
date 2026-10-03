import { Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';

/**
 * The only source of "now" in the API (TRD §4.2).
 * "Today" is the calendar date in the kitchen time zone, independent of the server's TZ.
 * Tests can pin the clock with `setFixedNow`.
 */
@Injectable()
export class ClockService {
  readonly zone: string;
  private fixedNow: Date | null = null;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    this.zone = env.KITCHEN_TZ;
  }

  now(): Date {
    return this.fixedNow ? new Date(this.fixedNow.getTime()) : new Date();
  }

  /** Kitchen-local calendar date of now, `YYYY-MM-DD`. */
  today(): string {
    return DateTime.fromJSDate(this.now(), { zone: this.zone }).toISODate() as string;
  }

  setFixedNow(at: Date | null): void {
    this.fixedNow = at;
  }
}
