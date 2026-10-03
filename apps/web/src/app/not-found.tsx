import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">The page you were looking for doesn&apos;t exist.</p>
      <Button asChild variant="outline">
        <Link href="/dashboard">Go to your dashboard</Link>
      </Button>
    </main>
  );
}
