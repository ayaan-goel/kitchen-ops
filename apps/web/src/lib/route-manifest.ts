import type { Permission } from '@fernleaf/shared';
import {
  BookOpen,
  Building2,
  ChefHat,
  ClipboardList,
  CookingPot,
  LayoutDashboard,
  ListTree,
  type LucideIcon,
  Receipt,
  Settings,
  Tags,
  TimerReset,
  Truck,
  UserCog,
  Users,
  UtensilsCrossed,
  Navigation,
} from 'lucide-react';

export interface AppRoute {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Permission needed to see the entry. Hiding is cosmetic; the API enforces access. */
  permission: Permission;
  group: 'Overview' | 'Operations' | 'Catalogue' | 'Customers' | 'Finance' | 'Admin';
}

/** One source for navigation and client-side route guards (Architecture §7). */
export const ROUTES: AppRoute[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.view', group: 'Overview' },
  { href: '/orders', label: 'Orders', icon: ClipboardList, permission: 'orders.read', group: 'Operations' },
  { href: '/kitchen', label: 'Kitchen board', icon: CookingPot, permission: 'kitchen.read', group: 'Operations' },
  { href: '/dispatch', label: 'Dispatch board', icon: Truck, permission: 'dispatch.read', group: 'Operations' },
  { href: '/driver', label: 'My deliveries', icon: Navigation, permission: 'deliveries.own', group: 'Operations' },
  { href: '/catalogue/dishes', label: 'Dishes', icon: UtensilsCrossed, permission: 'catalogue.read', group: 'Catalogue' },
  { href: '/catalogue/options', label: 'Options', icon: ListTree, permission: 'catalogue.read', group: 'Catalogue' },
  { href: '/menu', label: 'Menu', icon: BookOpen, permission: 'menu.read', group: 'Catalogue' },
  { href: '/pricing', label: 'Pricing', icon: Tags, permission: 'pricing.read', group: 'Catalogue' },
  { href: '/reference-data', label: 'Reference data', icon: ChefHat, permission: 'reference.read', group: 'Catalogue' },
  { href: '/companies', label: 'Companies', icon: Building2, permission: 'companies.read', group: 'Customers' },
  { href: '/employees', label: 'Employees', icon: Users, permission: 'employees.read', group: 'Customers' },
  { href: '/billing', label: 'Billing', icon: Receipt, permission: 'billing.read', group: 'Finance' },
  { href: '/staff', label: 'Staff', icon: UserCog, permission: 'staff.read', group: 'Admin' },
  { href: '/settings/cutoffs', label: 'Cut-off console', icon: TimerReset, permission: 'cutoff.run', group: 'Admin' },
  { href: '/settings', label: 'Settings', icon: Settings, permission: 'settings.read', group: 'Admin' },
];

export const ROUTE_GROUPS: AppRoute['group'][] = ['Overview', 'Operations', 'Catalogue', 'Customers', 'Finance', 'Admin'];

/** Finds the manifest entry that owns a pathname (longest matching prefix). */
export function routeFor(pathname: string): AppRoute | undefined {
  return ROUTES.filter((r) => pathname === r.href || pathname.startsWith(`${r.href}/`)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
}
