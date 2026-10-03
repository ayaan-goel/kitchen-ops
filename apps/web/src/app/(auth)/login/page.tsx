import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Leaf } from 'lucide-react';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Leaf className="size-6" aria-hidden />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Fernleaf Kitchen Ops</h1>
          <p className="text-sm text-muted-foreground">Sign in with your staff account</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
