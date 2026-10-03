'use client';

import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCents, formatDate } from '@/lib/format';

interface Day {
  date: string;
  bookedCents: number;
  orders: number;
}

const H = 160;
const PAD = { top: 18, right: 8, bottom: 22, left: 44 };

/** Clean axis steps: 0, 500, 1,000 … in dollars. */
function niceMax(maxDollars: number): { max: number; step: number } {
  if (maxDollars <= 0) return { max: 100, step: 50 };
  const raw = maxDollars / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  return { max: Math.ceil(maxDollars / step) * step, step };
}

const compact = (dollars: number) => (dollars >= 1000 ? `$${(dollars / 1000).toFixed(dollars % 1000 === 0 ? 0 : 1)}K` : `$${dollars}`);

/**
 * A5 "Booked value, last 14 days" — one series, so one hue (primary) and no legend; the title
 * names it. Columns ≤ 24 px with a 4 px rounded cap, hairline grid, hover tooltip, and a table view.
 */
export function BookedChart({ days, today }: { days: Day[]; today: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const W = 640;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const { max, step } = niceMax(Math.max(...days.map((d) => d.bookedCents)) / 100);
  const band = innerW / days.length;
  const barW = Math.min(24, band - 2);
  const y = (cents: number) => PAD.top + innerH - (cents / 100 / max) * innerH;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const peak = days.reduce((best, d, i) => (d.bookedCents > days[best]!.bookedCents ? i : best), 0);

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button type="button" className="text-xs text-primary hover:underline" onClick={() => setAsTable((t) => !t)} aria-pressed={asTable}>
          {asTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>
      {asTable ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Delivery date</TableHead>
              <TableHead className="text-right">Committed orders</TableHead>
              <TableHead className="text-right">Booked value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.map((d) => (
              <TableRow key={d.date}>
                <TableCell>{formatDate(d.date)}</TableCell>
                <TableCell className="text-right tabular-nums">{d.orders}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCents(d.bookedCents)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Booked value per delivery date, last 14 days">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t * 100)} y2={y(t * 100)} className="stroke-border" strokeWidth={1} />
                <text x={PAD.left - 6} y={y(t * 100)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                  {compact(t)}
                </text>
              </g>
            ))}
            {days.map((d, i) => {
              const x = PAD.left + band * i + (band - barW) / 2;
              const top = y(d.bookedCents);
              const h = PAD.top + innerH - top;
              const r = Math.min(4, h);
              const isToday = d.date === today;
              return (
                <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  {/* Hit target: the whole band, taller than the mark. */}
                  <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} fill="transparent" />
                  {h > 0 && (
                    <path
                      d={`M${x},${top + r} q0,-${r} ${r},-${r} h${barW - 2 * r} q${r},0 ${r},${r} v${h - r} h-${barW} z`}
                      className={hover === null || hover === i ? 'fill-primary' : 'fill-primary/40'}
                    />
                  )}
                  {(i % 2 === days.length % 2 || isToday) && (
                    <text x={x + barW / 2} y={H - 6} textAnchor="middle" className={`text-[10px] ${isToday ? 'fill-foreground font-semibold' : 'fill-muted-foreground'}`}>
                      {isToday ? 'Today' : formatDate(d.date, { day: 'numeric', month: 'short' })}
                    </text>
                  )}
                  {i === peak && d.bookedCents > 0 && hover === null && (
                    <text x={x + barW / 2} y={top - 5} textAnchor="middle" className="fill-foreground text-[10px] font-medium tabular-nums">
                      {compact(Math.round(d.bookedCents / 100))}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
              style={{ left: `${((PAD.left + band * hover + band / 2) / W) * 100}%` }}
              role="status"
            >
              <p className="font-medium">{formatDate(days[hover]!.date, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
              <p className="tabular-nums">
                {formatCents(days[hover]!.bookedCents)} · {days[hover]!.orders} orders
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
