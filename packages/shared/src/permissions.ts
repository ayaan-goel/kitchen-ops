/**
 * Permission catalogue (TRD §4.8).
 *
 * Code checks permissions, never role names. Roles are data: a Role row lists the permission keys
 * it grants, so adding a role is a data change (ACC-04).
 */
export const PERMISSIONS = {
  'dashboard.view': 'See the dashboard for your role',
  'staff.read': 'View staff accounts and roles',
  'staff.manage': 'Create staff, change roles, deactivate, reset passwords',
  'reference.read': 'View reference lists (allergens, tags, stations, sizes, packaging)',
  'reference.manage': 'Edit reference lists',
  'catalogue.read': 'View dishes, options and option groups',
  'catalogue.manage': 'Edit dishes, options, option groups and portions',
  'pricing.read': 'View price tiers and prices',
  'pricing.manage': 'Edit price tiers and prices',
  'menu.read': 'View menu categories and items',
  'menu.manage': 'Edit the menu and preview it as an employee (with prices)',
  'companies.read': 'View companies',
  'companies.manage': 'Edit companies, domains, addresses, calendars, delivery defaults',
  'employees.read': 'View employees',
  'employees.manage': 'Edit, move and import employees',
  'orders.read': 'View orders',
  'orders.write': 'Create, edit, place and cancel orders before the cut-off',
  'orders.override': 'Change orders after the cut-off, reject orders, override delivery details',
  'cutoff.run': 'Use the cut-off console and run cut-off processing',
  'kitchen.read': 'View the kitchen board',
  'kitchen.work': 'Mark prep units started and done',
  'kitchen.forceComplete': 'Force-complete all prep units of an order',
  'dispatch.read': 'View the dispatch board',
  'dispatch.manage': 'Assign drivers and advance drops',
  'deliveries.own': "See and complete one's own deliveries for today (makes the user assignable as a driver)",
  'billing.read': 'View billing and invoices',
  'billing.manage': 'Create invoices, mark them paid, add adjustments',
  'settings.read': 'View platform settings',
  'settings.manage': 'Edit platform settings and kitchen holidays',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}

/** Landing dashboard kinds; mirrors the Prisma `DashboardKind` enum. */
export const DASHBOARD_KINDS = ['ADMIN', 'KITCHEN', 'DISPATCH', 'DRIVER'] as const;
export type DashboardKind = (typeof DASHBOARD_KINDS)[number];
