'use client';

import { RotateCcw } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/** Last-resort boundary for an unexpected rendering error inside the app shell. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
      <h1 className="font-semibold">Something went wrong on this page</h1>
      <p className="max-w-md text-sm text-muted-foreground">The rest of the app still works. Try again; if it keeps happening, reload the page.</p>
      <Button variant="outline" onClick={reset}>
        <RotateCcw className="size-4" /> Try again
      </Button>
    </div>
  );
}
