import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { PrismaClient } from '../../generated/prisma/client';

/** Adapter for the pg driver. `schema` isolates integration tests in their own Postgres schema. */
export function createPgAdapter(connectionString: string, schema?: string): PrismaPg {
  return new PrismaPg(
    {
      connectionString,
      max: 5,
      // Raw SQL (e.g. cut-off processing) must resolve unqualified table names in the same schema.
      ...(schema ? { options: `-c search_path="${schema}"` } : {}),
    },
    schema ? { schema } : undefined,
  );
}

/** The single Prisma client (pooled Neon connection through the pg driver adapter). */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(APP_ENV) env: AppEnv) {
    super({ adapter: createPgAdapter(env.DATABASE_URL, env.DATABASE_SCHEMA) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
