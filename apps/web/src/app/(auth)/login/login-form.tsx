'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput, type MeResponse } from '@fernleaf/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ChefHat, Loader2, ShieldCheck, Truck, Warehouse } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, apiFetch } from '@/lib/api-client';
import { meQueryKey } from '@/lib/auth';
import { cn } from '@/lib/utils';

/** The four review accounts (also listed in the README). Clicking one fills the form. */
const DEMO_PASSWORD = 'Test@1234';
const DEMO_PROFILES = [
  { role: 'Admin', email: 'admin@test.com', blurb: 'Everything: orders, billing, catalogue, settings', icon: ShieldCheck },
  { role: 'Kitchen', email: 'kitchen@test.com', blurb: 'Cook list and the kitchen board', icon: ChefHat },
  { role: 'Dispatch', email: 'dispatch@test.com', blurb: 'Drops, drivers and departures', icon: Warehouse },
  { role: 'Driver', email: 'driver@test.com', blurb: 'Today’s deliveries (best on a phone)', icon: Truck },
] as const;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const submitRef = useRef<HTMLButtonElement>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const email = useWatch({ control, name: 'email' });

  const fill = (profileEmail: string) => {
    setFormError(null);
    setValue('email', profileEmail, { shouldValidate: true });
    setValue('password', DEMO_PASSWORD, { shouldValidate: true });
    submitRef.current?.focus();
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const me = await apiFetch<MeResponse>('/auth/login', { method: 'POST', body: values });
      queryClient.clear();
      queryClient.setQueryData(meQueryKey, me);
      const next = searchParams.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.issues.length > 0) {
        for (const issue of err.issues) {
          const field = issue.path[0];
          if (field === 'email' || field === 'password') setError(field, { message: issue.message });
        }
      } else {
        setFormError(err instanceof ApiError ? err.message : 'Sign-in failed. Please try again.');
      }
    }
  });

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border bg-card p-5 sm:p-6" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="username" autoFocus {...register('email')} aria-invalid={!!errors.email} className="h-10" />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" {...register('password')} aria-invalid={!!errors.password} className="h-10" />
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>
        {formError && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}
        <Button ref={submitRef} type="submit" className="h-10 w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Sign in
        </Button>
      </form>

      <section aria-labelledby="demo-title">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 id="demo-title" className="text-sm font-semibold">
            Demo profiles
          </h3>
          <span className="text-xs text-muted-foreground">
            Password <span className="font-mono">{DEMO_PASSWORD}</span>
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {DEMO_PROFILES.map((p) => {
            const selected = email === p.email;
            return (
              <button
                key={p.email}
                type="button"
                onClick={() => fill(p.email)}
                aria-pressed={selected}
                className={cn(
                  'flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  selected && 'border-primary bg-accent ring-1 ring-primary',
                )}
              >
                <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', selected ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground')}>
                  <p.icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{p.role}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.email}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{p.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Click a profile to fill in its email and password, then press Sign in.</p>
      </section>
    </div>
  );
}
