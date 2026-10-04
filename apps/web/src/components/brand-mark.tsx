import { cn } from '@/lib/utils';

/** Fernleaf mark: a saffron tile with a single curry leaf. Simple enough to read at 20 px. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground', className)} aria-hidden>
      <svg viewBox="0 0 24 24" className="size-[60%]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 19c0-8 5-13.5 14-14-.5 9-6 14-14 14Z" />
        <path d="M5 19 13 11" />
      </svg>
    </span>
  );
}
