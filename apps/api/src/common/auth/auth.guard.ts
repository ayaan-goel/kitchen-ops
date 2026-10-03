import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { Unauthenticated } from '../errors/domain-error';
import { type AuthUser, SESSION_COOKIE, type SessionClaims } from './auth-user';
import { ACCESS_KEY, type AccessRule } from './decorators';
import { SessionUserCache } from './session-user.cache';

/**
 * Authenticates every non-public request from the httpOnly session cookie and attaches
 * `req.user`. The user is re-loaded (30 s cache) so deactivation or role changes apply quickly.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly users: SessionUserCache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (rule?.kind === 'public') return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token: unknown = request.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token.length === 0) throw new Unauthenticated();

    let claims: SessionClaims;
    try {
      claims = await this.jwt.verifyAsync<SessionClaims>(token);
    } catch {
      throw new Unauthenticated('Your session has expired. Please sign in again.');
    }

    const user = await this.users.get(claims.sub, claims.sv);
    if (!user) throw new Unauthenticated('Your session is no longer valid. Please sign in again.');
    request.user = user;
    return true;
  }
}
