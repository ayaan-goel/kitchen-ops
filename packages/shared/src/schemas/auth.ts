import { z } from 'zod';
import { DASHBOARD_KINDS, type Permission } from '../permissions';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const dashboardKindSchema = z.enum(DASHBOARD_KINDS);

/** Response of GET /api/auth/me (and POST /api/auth/login). */
export interface MeResponse {
  user: { id: string; name: string; email: string };
  role: { key: string; name: string; dashboard: z.infer<typeof dashboardKindSchema> };
  permissions: Permission[];
}
