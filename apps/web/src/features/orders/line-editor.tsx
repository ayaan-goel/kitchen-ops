'use client';

import type { MenuDishDto, MenuGroupDto } from '@fernleaf/shared';
import { AlertTriangle, Minus, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCents } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface Choice {
  optionId: string;
  portionSizeId?: string;
}

export interface ComboState {
  key: string;
  quantity: number;
  /** groupId → chosen options */
  choices: Record<string, Choice[]>;
}

export interface LineState {
  key: string;
  dishId: string;
  quantity: number;
  combos: ComboState[];
}

export interface FieldMessage {
  path: (string | number)[];
  message: string;
}

let seq = 0;
export const newKey = () => `k${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Sensible starting choices: the first option of every required single-choice group. */
export function defaultChoices(dish: MenuDishDto): Record<string, Choice[]> {
  const choices: Record<string, Choice[]> = {};
  for (const g of dish.groups) {
    if (g.isRequired && g.maxSelections === 1 && g.options[0]) {
      choices[g.id] = [{ optionId: g.options[0].optionId, portionSizeId: g.usesPortions ? g.options[0].portions[0]?.portionSizeId : undefined }];
    }
  }
  return choices;
}

const NONE = '__none';

function GroupPicker({ group, value, onChange }: { group: MenuGroupDto; value: Choice[]; onChange: (v: Choice[]) => void }) {
  const portionsFor = (optionId: string) => group.options.find((o) => o.optionId === optionId)?.portions ?? [];

  if (group.maxSelections === 1) {
    const current = value[0];
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={current?.optionId ?? NONE}
          onValueChange={(optionId) =>
            onChange(optionId === NONE ? [] : [{ optionId, portionSizeId: group.usesPortions ? (current?.portionSizeId ?? portionsFor(optionId)[0]?.portionSizeId) : undefined }])
          }
        >
          <SelectTrigger className="h-8 min-w-44" aria-label={group.name}>
            <SelectValue placeholder={group.isRequired ? 'Choose…' : 'None'} />
          </SelectTrigger>
          <SelectContent>
            {!group.isRequired && <SelectItem value={NONE}>None</SelectItem>}
            {group.options.map((o) => (
              <SelectItem key={o.optionId} value={o.optionId}>
                {o.name}
                {o.priceCents > 0 ? ` (+${formatCents(o.priceCents)})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {group.usesPortions && current && (
          <Select value={current.portionSizeId ?? NONE} onValueChange={(portionSizeId) => onChange([{ ...current, portionSizeId }])}>
            <SelectTrigger className="h-8 min-w-32" aria-label={`${group.name} size`}>
              <SelectValue placeholder="Size" />
            </SelectTrigger>
            <SelectContent>
              {portionsFor(current.optionId).map((p) => (
                <SelectItem key={p.portionSizeId} value={p.portionSizeId}>
                  {p.name}
                  {p.extraCents > 0 ? ` (+${formatCents(p.extraCents)})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {group.options.map((o) => {
        const checked = value.some((c) => c.optionId === o.optionId);
        return (
          <label key={o.optionId} className="flex items-center gap-1.5 text-sm">
            <Checkbox
              checked={checked}
              onCheckedChange={(on) =>
                onChange(
                  on
                    ? [...value, { optionId: o.optionId, portionSizeId: group.usesPortions ? o.portions[0]?.portionSizeId : undefined }]
                    : value.filter((c) => c.optionId !== o.optionId),
                )
              }
            />
            {o.name}
            {o.priceCents > 0 && <span className="text-muted-foreground">+{formatCents(o.priceCents)}</span>}
          </label>
        );
      })}
      <span className="text-xs text-muted-foreground">up to {group.maxSelections}</span>
    </div>
  );
}

export function LineEditor({
  index,
  line,
  dish,
  issues,
  warnings,
  onChange,
  onRemove,
}: {
  index: number;
  line: LineState;
  dish: MenuDishDto | undefined;
  issues: FieldMessage[];
  warnings: FieldMessage[];
  onChange: (line: LineState) => void;
  onRemove: () => void;
}) {
  const allocated = line.combos.reduce((s, c) => s + (Number.isFinite(c.quantity) ? c.quantity : 0), 0);
  const at = (path: (string | number)[], list: FieldMessage[]) =>
    list.filter((m) => m.path.length >= path.length && path.every((p, i) => m.path[i] === p));
  const lineLevel = issues.filter((m) => m.path.length <= 3 && m.path[0] === 'lines' && m.path[1] === index);

  if (!dish) {
    return (
      <div className="rounded-lg border border-destructive/40 p-3 text-sm">
        This dish is no longer on the employee’s menu.{' '}
        <Button variant="link" size="sm" onClick={onRemove}>
          Remove
        </Button>
      </div>
    );
  }

  const setCombo = (key: string, patch: Partial<ComboState>) =>
    onChange({ ...line, combos: line.combos.map((c) => (c.key === key ? { ...c, ...patch } : c)) });

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{dish.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatCents(dish.priceCents)} base · {dish.temperature === 'HOT' ? 'Hot' : 'Cold'}
            {dish.minOrderQty ? ` · minimum ${dish.minOrderQty}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor={`qty-${line.key}`}>
            Quantity
          </label>
          <Input
            id={`qty-${line.key}`}
            type="number"
            min={1}
            className="h-8 w-20"
            value={line.quantity}
            onChange={(e) => onChange({ ...line, quantity: Number(e.target.value) })}
          />
          <span
            className={cn(
              'rounded-md px-2 py-0.5 text-xs tabular-nums',
              allocated === line.quantity ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
            )}
            aria-live="polite"
          >
            {allocated} / {line.quantity} allocated
          </span>
          <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${dish.name}`}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {lineLevel.map((m, i) => (
        <p key={i} className="mt-2 text-sm text-destructive">
          {m.message}
        </p>
      ))}

      <div className="mt-3 space-y-3">
        {line.combos.map((combo, j) => {
          const path = ['lines', index, 'combinations', j];
          const comboIssues = at(path, issues);
          const comboWarnings = at(path, warnings);
          return (
            <div key={combo.key} className="rounded-lg bg-muted/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Combination {j + 1}</span>
                <div className="ml-auto flex items-center gap-1">
                  <Button variant="outline" size="icon" className="size-7" aria-label="Decrease" onClick={() => setCombo(combo.key, { quantity: Math.max(1, combo.quantity - 1) })}>
                    <Minus className="size-3.5" />
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    aria-label={`Combination ${j + 1} quantity`}
                    className="h-7 w-16 text-center"
                    value={combo.quantity}
                    onChange={(e) => setCombo(combo.key, { quantity: Number(e.target.value) })}
                  />
                  <Button variant="outline" size="icon" className="size-7" aria-label="Increase" onClick={() => setCombo(combo.key, { quantity: combo.quantity + 1 })}>
                    <Plus className="size-3.5" />
                  </Button>
                  {line.combos.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Remove combination ${j + 1}`}
                      onClick={() => onChange({ ...line, combos: line.combos.filter((c) => c.key !== combo.key) })}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              {dish.groups.length > 0 && (
                <div className="mt-2 grid gap-2">
                  {dish.groups.map((g) => (
                    <div key={g.id} className="grid gap-1 sm:grid-cols-[180px_1fr] sm:items-center">
                      <span className="text-sm">
                        {g.name}
                        {g.isRequired && <span className="text-destructive"> *</span>}
                      </span>
                      <GroupPicker
                        group={g}
                        value={combo.choices[g.id] ?? []}
                        onChange={(v) => setCombo(combo.key, { choices: { ...combo.choices, [g.id]: v } })}
                      />
                    </div>
                  ))}
                </div>
              )}
              {comboIssues.map((m, i) => (
                <p key={i} className="mt-2 text-sm text-destructive">
                  {m.message}
                </p>
              ))}
              {comboWarnings.map((m, i) => (
                <p key={i} className="mt-2 flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="size-4" aria-hidden /> {m.message}
                </p>
              ))}
            </div>
          );
        })}
      </div>
      {dish.groups.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() =>
            onChange({
              ...line,
              quantity: line.quantity + 1,
              combos: [...line.combos, { key: newKey(), quantity: 1, choices: defaultChoices(dish) }],
            })
          }
        >
          <Plus className="size-4" /> Add a different combination
        </Button>
      )}
    </div>
  );
}
