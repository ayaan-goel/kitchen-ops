'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Clock, Leaf, LogOut, Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, apiFetch } from '@/lib/api-client';
import { hasPermission, useMe } from '@/lib/auth';
import { formatKitchen, useKitchenNow } from '@/lib/kitchen-time';
import { ROUTE_GROUPS, ROUTES } from '@/lib/route-manifest';
import { cn } from '@/lib/utils';

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: me } = useMe();
  const visible = ROUTES.filter((r) => hasPermission(me, r.permission));
  // The most specific matching entry is the active one (e.g. /settings/cutoffs, not /settings).
  const activeHref = visible
    .filter((r) => pathname === r.href || pathname.startsWith(`${r.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className="space-y-5 px-3 py-4" aria-label="Main">
      {ROUTE_GROUPS.map((group) => {
        const items = visible.filter((r) => r.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} className="space-y-1">
            <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{group}</p>
            {items.map((r) => {
              const active = r.href === activeHref;
              return (
                <Link
                  key={r.href}
                  href={r.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                    active
                      ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60',
                  )}
                >
                  <r.icon className="size-4 shrink-0" aria-hidden />
                  {r.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 px-5 py-4 font-semibold tracking-tight">
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Leaf className="size-4" aria-hidden />
      </span>
      Fernleaf Ops
    </Link>
  );
}

function KitchenClock() {
  const { now, zone } = useKitchenNow(15_000);
  if (!now || !zone) return <Skeleton className="h-5 w-40" />;
  return (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums" title={`Kitchen time zone: ${zone}`}>
      <Clock className="size-4" aria-hidden />
      {formatKitchen(now, zone, { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
      {formatKitchen(now, zone)} IST
    </span>
  );
}

function UserMenu() {
  const { data: me } = useMe();
  const router = useRouter();
  const queryClient = useQueryClient();
  if (!me) return null;
  const initials = me.user.name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2);

  const logout = async () => {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    queryClient.clear();
    router.replace('/login');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-xs font-medium">
            {initials}
          </span>
          <span className="hidden text-left text-sm leading-tight sm:block">
            {me.user.name}
            <span className="block text-xs text-muted-foreground">{me.role.name}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium">{me.user.name}</p>
          <p className="text-xs text-muted-foreground">{me.user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout}>
          <LogOut className="size-4" aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me, error, isPending } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const unauthenticated = error instanceof ApiError && error.status === 401;
  useEffect(() => {
    if (unauthenticated) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [unauthenticated, router, pathname]);

  if (isPending || unauthenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }
  if (!me) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {error instanceof ApiError ? error.message : 'Could not load your account.'}
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 border-r bg-sidebar lg:block">
        <Brand />
        <NavLinks />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <Brand />
              <NavLinks onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <KitchenClock />
          <div className="ml-auto">
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
