import {
  type CallHandler,
  Controller,
  type ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  Module,
  type NestInterceptor,
  Post,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Cron } from '@nestjs/schedule';
import type { Observable } from 'rxjs';
import { RequirePermissions } from '../../common/auth/decorators';
import { OrderingModule } from '../ordering/ordering.module';
import { type DemoSummary, DemoService } from './demo.service';

@Controller('admin/demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Get()
  @RequirePermissions('settings.manage')
  status() {
    return this.demo.status();
  }

  /** Generates any missing demo dates and moves demo orders along by the clock, now. */
  @Post('refresh')
  @HttpCode(200)
  @RequirePermissions('settings.manage')
  refresh(): Promise<DemoSummary> {
    return this.demo.ensure();
  }
}

/** Signed-in traffic nudges the (throttled, non-blocking) refresh, so a new kitchen day fills itself. */
@Injectable()
export class DemoKickInterceptor implements NestInterceptor {
  constructor(private readonly demo: DemoService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ user?: unknown }>();
    if (request.user) this.demo.kick();
    return next.handle();
  }
}

@Injectable()
export class DemoScheduler {
  constructor(private readonly demo: DemoService) {}

  /** 00:05 kitchen time: generate the new day before anyone looks. */
  @Cron('5 0 * * *', { timeZone: process.env.KITCHEN_TZ ?? 'Asia/Kolkata' })
  daily(): void {
    this.demo.kick(true);
  }
}

@Module({
  imports: [OrderingModule],
  controllers: [DemoController],
  providers: [DemoService, DemoScheduler, { provide: APP_INTERCEPTOR, useClass: DemoKickInterceptor }],
})
export class DemoModule {}
