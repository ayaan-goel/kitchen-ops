import { Global, Module } from '@nestjs/common';
import { type AppEnv, loadEnv } from './env';

export const APP_ENV = Symbol('APP_ENV');

@Global()
@Module({
  providers: [{ provide: APP_ENV, useFactory: (): AppEnv => loadEnv() }],
  exports: [APP_ENV],
})
export class AppConfigModule {}
