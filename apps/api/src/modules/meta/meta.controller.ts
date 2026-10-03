import { Controller, Get } from '@nestjs/common';
import type { MetaResponse } from '@fernleaf/shared';
import { Authenticated } from '../../common/auth/decorators';
import { ClockService } from '../../common/clock/clock.service';

/** Server-side clock for the UI: the browser never decides what "today" is (NFR-02). */
@Controller('meta')
export class MetaController {
  constructor(private readonly clock: ClockService) {}

  @Get()
  @Authenticated()
  get(): MetaResponse {
    return {
      kitchenTimeZone: this.clock.zone,
      today: this.clock.today(),
      now: this.clock.now().toISOString(),
      currency: 'USD',
      appVersion: process.env.npm_package_version ?? '0.1.0',
    };
  }
}
