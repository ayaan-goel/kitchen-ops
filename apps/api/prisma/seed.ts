/**
 * Base seed (idempotent upserts). Phase 0: roles + staff, including the four review accounts
 * with the exact credentials required by the brief. Later phases extend this file.
 */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { ALL_PERMISSIONS, type DashboardKind, type Permission } from '@fernleaf/shared';
import { PrismaClient } from '../src/generated/prisma/client';

if (existsSync('.env')) process.loadEnvFile('.env');

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL (or DIRECT_URL) is required to seed');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

interface RoleSeed {
  key: string;
  name: string;
  description: string;
  dashboard: DashboardKind;
  permissions: Permission[];
}

// Role → permission mapping from docs/TRD.md §4.8. Admin gets everything except driving.
const ROLES: RoleSeed[] = [
  {
    key: 'ADMIN',
    name: 'Admin',
    description: 'Runs the platform: catalogue, pricing, companies, orders, billing, settings. Can override anything.',
    dashboard: 'ADMIN',
    permissions: ALL_PERMISSIONS.filter((p) => p !== 'deliveries.own'),
  },
  {
    key: 'KITCHEN',
    name: 'Kitchen',
    description: 'Cooks prep units and marks them started/done. Read-only on what the kitchen needs.',
    dashboard: 'KITCHEN',
    permissions: [
      'dashboard.view',
      'kitchen.read',
      'kitchen.work',
      'orders.read',
      'catalogue.read',
      'menu.read',
      'reference.read',
    ],
  },
  {
    key: 'DISPATCH',
    name: 'Dispatch',
    description: 'Moves cooked orders out of the door, assigns drivers, tracks deliveries.',
    dashboard: 'DISPATCH',
    permissions: [
      'dashboard.view',
      'dispatch.read',
      'dispatch.manage',
      'kitchen.read',
      'orders.read',
      'companies.read',
    ],
  },
  {
    key: 'DRIVER',
    name: 'Driver',
    description: 'Sees only their own drops for today and marks them delivered.',
    dashboard: 'DRIVER',
    permissions: ['dashboard.view', 'deliveries.own'],
  },
];

interface StaffSeed {
  email: string;
  name: string;
  roleKey: string;
  /** Fixed password for the review accounts; others get a random one that is never published. */
  password?: string;
  phone?: string;
}

const REVIEW_PASSWORD = 'Test@1234';

const STAFF: StaffSeed[] = [
  { email: 'admin@test.com', name: 'Aditi Rao', roleKey: 'ADMIN', password: REVIEW_PASSWORD },
  { email: 'kitchen@test.com', name: 'Kiran Shetty', roleKey: 'KITCHEN', password: REVIEW_PASSWORD },
  { email: 'dispatch@test.com', name: 'Deepak Verma', roleKey: 'DISPATCH', password: REVIEW_PASSWORD },
  { email: 'driver@test.com', name: 'Dev Malhotra', roleKey: 'DRIVER', password: REVIEW_PASSWORD, phone: '+91 98480 11001' },
  { email: 'ravi.kumar@fernleaf.kitchen', name: 'Ravi Kumar', roleKey: 'DRIVER', phone: '+91 98480 11002' },
  { email: 'sana.shaikh@fernleaf.kitchen', name: 'Sana Shaikh', roleKey: 'DRIVER', phone: '+91 98480 11003' },
  { email: 'priya.nair@fernleaf.kitchen', name: 'Priya Nair', roleKey: 'KITCHEN' },
];

async function seedRoles(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const role of ROLES) {
    const row = await prisma.role.upsert({
      where: { key: role.key },
      update: {
        name: role.name,
        description: role.description,
        dashboard: role.dashboard,
        permissions: role.permissions,
        isSystem: true,
      },
      create: { ...role, isSystem: true },
    });
    ids.set(role.key, row.id);
  }
  return ids;
}

async function seedStaff(roleIds: Map<string, string>): Promise<void> {
  for (const staff of STAFF) {
    const roleId = roleIds.get(staff.roleKey);
    if (!roleId) throw new Error(`Unknown role ${staff.roleKey}`);
    const existing = await prisma.staffUser.findUnique({ where: { email: staff.email } });
    // Review accounts always get their exact password back; others keep theirs once created.
    const password = staff.password ?? (existing ? null : randomBytes(18).toString('base64url'));
    const passwordHash = password ? await hash(password) : undefined;
    await prisma.staffUser.upsert({
      where: { email: staff.email },
      update: { name: staff.name, roleId, isActive: true, phone: staff.phone ?? null, ...(passwordHash ? { passwordHash } : {}) },
      create: { email: staff.email, name: staff.name, roleId, phone: staff.phone ?? null, passwordHash: passwordHash! },
    });
  }
}

async function main(): Promise<void> {
  const roleIds = await seedRoles();
  await seedStaff(roleIds);
  console.log(`Seeded ${ROLES.length} roles and ${STAFF.length} staff users.`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
