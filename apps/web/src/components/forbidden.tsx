import { ShieldX } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function Forbidden() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
      <ShieldX className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-semibold">Not available for your role</h1>
      <p className="text-sm text-muted-foreground">
        Your account doesn&apos;t have access to this area. If you think it should, ask an admin.
      </p>
      <Button asChild variant="outline">
        <Link href="/dashboard">Back to your dashboard</Link>
      </Button>
    </div>
  );
}
