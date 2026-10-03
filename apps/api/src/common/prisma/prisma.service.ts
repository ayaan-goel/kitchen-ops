import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { PrismaClient } from '../../generated/prisma/client';

/** The single Prisma client (pooled Neon connection through the pg driver adapter). */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(APP_ENV) env: AppEnv) {
    super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: 5 }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
