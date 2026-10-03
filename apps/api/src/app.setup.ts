import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { requireFetchHeader } from './common/http/csrf.middleware';

/** HTTP pipeline shared by main.ts and the integration tests. */
export function configureApp(app: NestExpressApplication): void {
  app.set('trust proxy', 1); // behind Render's proxy and the Vercel rewrite
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });
  app.use(requireFetchHeader);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
}
