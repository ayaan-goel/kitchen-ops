import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { requireFetchHeader } from './common/http/csrf.middleware';
import { APP_ENV } from './config/config.module';
import type { AppEnv } from './config/env';

async function bootstrap(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const env = app.get<AppEnv>(APP_ENV);

  app.useLogger(app.get(Logger));
  app.set('trust proxy', 1); // behind Render's proxy and the Vercel rewrite
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });
  app.use(requireFetchHeader);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap();
