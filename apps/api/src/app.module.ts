import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthGuard } from './common/auth/auth.guard';
import { PermissionsGuard } from './common/auth/permissions.guard';
import { ClockModule } from './common/clock/clock.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { APP_ENV, AppConfigModule } from './config/config.module';
import type { AppEnv } from './config/env';
import { AuthModule } from './modules/auth/auth.module';
import { CutoffModule } from './modules/cutoff/cutoff.module';
import { DispatchModule } from './modules/dispatch/dispatch.module';
import { FilesModule } from './modules/files/files.module';
import { BillingModule } from './modules/billing/billing.module';
import { KitchenModule } from './modules/kitchen/kitchen.module';
import { OrderingModule } from './modules/ordering/ordering.module';
import { SettingsModule } from './modules/settings/settings.module';
import { HealthController } from './modules/health/health.controller';
import { MetaController } from './modules/meta/meta.controller';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [APP_ENV],
      useFactory: (env: AppEnv) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          genReqId: (req, res) => {
            const incoming = req.headers['x-request-id'];
            const id = typeof incoming === 'string' && incoming.length <= 100 ? incoming : randomUUID();
            res.setHeader('x-request-id', id);
            return id;
          },
          redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
          autoLogging: { ignore: (req) => req.url?.startsWith('/api/health') ?? false },
          transport:
            env.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    ScheduleModule.forRoot(),
    ClockModule,
    PrismaModule,
    AuthModule,
    SettingsModule,
    FilesModule,
    BillingModule,
    DispatchModule,
    CutoffModule,
    OrderingModule,
    KitchenModule,
  ],
  controllers: [HealthController, MetaController],
  providers: [
    // Order matters: rate limit → authenticate → authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
