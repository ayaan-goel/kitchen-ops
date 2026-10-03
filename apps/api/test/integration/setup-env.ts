import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

// The pooled Neon endpoint cannot take a per-connection search_path, so tests use the direct one.
process.env.DATABASE_URL = process.env.DIRECT_URL;
process.env.DATABASE_SCHEMA = 'fl_test';
process.env.NODE_ENV = 'test';
process.env.COOKIE_SECURE = 'false';
process.env.LOG_LEVEL = 'error';
process.env.DEMO_DATA_ENABLED = 'false';
