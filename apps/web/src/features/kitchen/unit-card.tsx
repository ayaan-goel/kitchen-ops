'use client';

import type { KitchenUnitDto } from '@fernleaf/shared';
import { AlertTriangle, Check, Flame, Play, Snowflake } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { formatOrderNumber } from '@/lib/format';
import { formatKitchen } from '@/lib/kitchen-time';
import { cn } from '@/lib/utils';

const RISK_BAR: Record<KitchenUnitDto['risk'], string> = {
  LATE: 'bg-status-late',
  AT_RISK: 'bg-status-risk',
  OK: 'bg-border',
  DONE: 'bg-status-ok',
};

export function RiskBadge({ risk }: { risk: KitchenUnitDto['risk'] }) {
  if (risk === 'LATE') return <span className="rounded bg-status-late px-1.5 py-0.5 text-[11px] font-semibold text-white">LATE</span>;
  if (risk === 'AT_RISK') return <span className="rounded bg-status-risk px-1.5 py-0.5 text-[11px] font-semibold text-black">AT RISK</span>;
  return null;
}

export function UnitCard({
  unit,
  zone,
  canWork,
  busy,
  onAction,
}: {
  unit: KitchenUnitDto;
  zone: string;
  canWork: boolean;
  busy: boolean;
  onAction: (action: 'start' | 'done') => void;
}) {
  const time = (iso: string) => formatKitchen(iso, zone);
  return (
    <div
      className={cn('relative flex overflow-hidden rounded-lg border bg-card [content-visibility:auto]', unit.status === 'DONE' && 'opacity-60')}
      style={{ containIntrinsicSize: '0 96px' }}
    >
      <div className={cn('w-1.5 shrink-0', RISK_BAR[unit.risk])} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 p-3">
        <div className="flex w-14 shrink-0 flex-col items-center">
          <span className="text-2xl leading-none font-semibold tabular-nums">{unit.quantity}</span>
          <span className="text-[10px] text-muted-foreground uppercase">boxes</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-medium">
            {unit.temperature === 'HOT' ? (
              <Flame className="size-3.5 text-orange-500" aria-label="Hot" />
            ) : (
              <Snowflake className="size-3.5 text-sky-500" aria-label="Cold" />
            )}
            {unit.dishName}
            <RiskBadge risk={unit.risk} />
          </p>
          {unit.label && <p className="text-sm">{unit.label}</p>}
          <p className="text-xs text-muted-foreground">
            <Link href={`/orders/${unit.orderId}`} className="hover:underline">
              {formatOrderNumber(unit.orderNumber)}
            </Link>{' '}
            · {unit.companyName} · {unit.employeeName} · deliver {unit.deliveryTime}
          </p>
          {(unit.allergens.length > 0 || unit.allergyConflicts.length > 0) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {unit.allergens.map((a) =>
                unit.allergyConflicts.includes(a) ? (
                  <span key={a} className="flex items-center gap-1 rounded bg-status-late px-1.5 py-0.5 text-[11px] font-medium text-white">
                    <AlertTriangle className="size-3" aria-hidden /> {a}: employee allergic
                  </span>
                ) : (
                  <span key={a} className="rounded border px-1.5 py-0.5 text-[11px]">
                    {a}
                  </span>
                ),
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {unit.status === 'DONE' ? (
            <span className="text-xs text-muted-foreground">
              Done {unit.doneAt ? time(unit.doneAt) : ''}
              {unit.doneBy ? ` · ${unit.doneBy}` : ''}
            </span>
          ) : (
            <>
              {unit.status === 'IN_PROGRESS' && (
                <span className="text-xs text-muted-foreground">
                  Started {unit.startedAt ? time(unit.startedAt) : ''}
                  {unit.startedBy ? ` · ${unit.startedBy}` : ''}
                </span>
              )}
              {canWork && unit.status === 'NOT_STARTED' && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction('start')}>
                  <Play className="size-4" /> Start
                </Button>
              )}
              {canWork && (
                <Button size="sm" disabled={busy} onClick={() => onAction('done')}>
                  <Check className="size-4" /> Done
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
