import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

const POINTS = [
  'Orders close at the cut-off and go straight to the kitchen board.',
  'Every box is tracked from the stove to the client’s door.',
  'Invoices stay exact to the cent.',
];

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <BrandMark className="size-10" />
          <span className="leading-tight">
            <span className="block font-display text-lg font-semibold">Fernleaf Kitchen</span>
            <span className="block text-xs tracking-[0.14em] text-sidebar-foreground/55 uppercase">Operations</span>
          </span>
        </div>
        <div className="max-w-md">
          <h1 className="font-display text-4xl leading-tight font-semibold tracking-tight">
            From order to doorstep, <span className="text-brand">one kitchen</span>, one panel.
          </h1>
          <ul className="mt-6 space-y-3 text-sm text-sidebar-foreground/80">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-sidebar-foreground/45">Kitchen time: Asia/Kolkata (IST)</p>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center gap-3 lg:hidden">
            <BrandMark className="size-10" />
            <span className="font-display text-lg font-semibold">Fernleaf Kitchen Ops</span>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="mt-1 text-sm text-muted-foreground">Use your staff account, or pick a demo profile below.</p>
          </div>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
