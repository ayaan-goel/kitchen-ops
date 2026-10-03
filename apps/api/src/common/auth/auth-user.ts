import type { DashboardKind, Permission } from '@fernleaf/shared';

/** The signed-in staff user, attached to the request by AuthGuard. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  roleKey: string;
  roleName: string;
  dashboard: DashboardKind;
  permissions: ReadonlySet<Permission>;
}

export interface SessionClaims {
  sub: string;
  /** StaffUser.sessionVersion at sign-in; a bump revokes the session. */
  sv: number;
}

export const SESSION_COOKIE = 'fl_session';
