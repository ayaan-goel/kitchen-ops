import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 does not load .env by itself.
if (existsSync('.env')) process.loadEnvFile('.env');

// Migrations use the direct (non-pooled) connection. `prisma generate` needs no URL, so a
// placeholder keeps builds working where no database is configured.
const base = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? 'postgresql://placeholder@localhost/none';
// Integration tests migrate into their own schema (see test/integration/global-setup.ts).
const schema = process.env.DATABASE_SCHEMA;
const url = schema ? `${base}${base.includes('?') ? '&' : '?'}schema=${schema}` : base;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: { url },
});
