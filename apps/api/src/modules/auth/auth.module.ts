import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SessionUserCache } from '../../common/auth/session-user.cache';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_ENV],
      useFactory: (env: AppEnv) => ({
        secret: env.JWT_SECRET,
        signOptions: { expiresIn: `${env.SESSION_TTL_HOURS}h` },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionUserCache],
  exports: [JwtModule, SessionUserCache],
})
export class AuthModule {}
