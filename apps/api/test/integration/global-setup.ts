import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Client } from 'pg';

/** Dedicated schema: the real `public` tables are never touched by integration tests. */
export const TEST_SCHEMA = 'fl_test';

export default async function setup(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const url = process.env.DIRECT_URL;
  if (!url) throw new Error('Integration tests need DIRECT_URL (see apps/api/.env.example).');

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
    await client.query(`CREATE SCHEMA "${TEST_SCHEMA}"`);
  } finally {
    await client.end();
  }

  const env = { ...process.env, DATABASE_SCHEMA: TEST_SCHEMA };
  execSync('pnpm exec prisma migrate deploy', { env, stdio: 'inherit' });
  execSync('pnpm exec tsx prisma/seed.ts', { env, stdio: 'inherit' });
}
