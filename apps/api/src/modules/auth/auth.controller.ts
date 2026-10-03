import { Body, Controller, Get, HttpCode, Inject, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { loginSchema, type LoginInput, type MeResponse } from '@fernleaf/shared';
import type { CookieOptions, Response } from 'express';
import { type AuthUser, SESSION_COOKIE } from '../../common/auth/auth-user';
import { Authenticated, CurrentUser, Public } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const { token, me } = await this.auth.login(body);
    res.cookie(SESSION_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: this.env.SESSION_TTL_HOURS * 60 * 60 * 1000,
    });
    return me;
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  @Get('me')
  @Authenticated()
  me(@CurrentUser() user: AuthUser): MeResponse {
    return this.auth.toMe(user);
  }

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: this.env.COOKIE_SECURE, sameSite: 'lax', path: '/' };
  }
}
