'use client';

import type {
  EmployeeSearchItemDto,
  MenuCategoryDto,
  MenuDishDto,
  OrderDetailDto,
  OrderInput,
} from '@fernleaf/shared';
import { AlertTriangle, Check, Eye, Flame, Loader2, Snowflake } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api-client';
import { hasPermission, useMe } from '@/lib/auth';
import { formatCents, formatDate, formatOrderNumber } from '@/lib/format';
import { useMeta } from '@/lib/kitchen-time';
import { cn } from '@/lib/utils';
import {
  useCreateOrder,
  useEmployeeMenu,
  useOrderingCalendar,
  useOrderingContext,
  useQuote,
  useUpdateOrder,
} from './api';
import { DateStrip } from './date-strip';
import { EmployeePicker } from './employee-picker';
import { type Choice, defaultChoices, type FieldMessage, type LineState, LineEditor, newKey } from './line-editor';

function timesInWindow(start: string, end: string, step: number): string[] {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const out: string[] = [];
  for (let m = toMin(start); m <= toMin(end); m += step) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}

function linesFromOrder(order: OrderDetailDto): LineState[] {
  return order.lines.map((l) => ({
    key: newKey(),
    dishId: l.dishId,
    quantity: l.quantity,
    combos: l.combinations.map((c) => {
      const choices: Record<string, Choice[]> = {};
      for (const s of c.selections) {
        if (!s.groupId) continue;
        choices[s.groupId] = [...(choices[s.groupId] ?? []), { optionId: s.optionId, portionSizeId: s.portionSizeId ?? undefined }];
      }
      return { key: newKey(), quantity: c.quantity, choices };
    }),
  }));
}

function toPayloadLines(lines: LineState[]): OrderInput['lines'] {
  return lines.map((l) => ({
    dishId: l.dishId,
    quantity: Number.isFinite(l.quantity) ? l.quantity : 0,
    combinations: l.combos.map((c) => ({
      quantity: Number.isFinite(c.quantity) ? c.quantity : 0,
      selections: Object.entries(c.choices).flatMap(([groupId, picks]) =>
        picks.map((p) => ({ groupId, optionId: p.optionId, ...(p.portionSizeId ? { portionSizeId: p.portionSizeId } : {}) })),
      ),
    })),
  }));
}

function DishCard({ dish, added, onAdd }: { dish: MenuDishDto; added: boolean; onAdd: () => void }) {
  return (
    <div className="flex flex-col rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium leading-tight">{dish.name}</p>
        {dish.temperature === 'HOT' ? (
          <Flame className="size-4 shrink-0 text-orange-500" aria-label="Hot" />
        ) : (
          <Snowflake className="size-4 shrink-0 text-sky-500" aria-label="Cold" />
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{dish.description}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {dish.dietaryTags.slice(0, 3).map((t) => (
          <Badge key={t} variant="secondary" className="text-[10px]">
            {t}
          </Badge>
        ))}
        {dish.allergens.map((a) => (
          <Badge key={a} variant="outline" className="text-[10px]">
            {a}
          </Badge>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between pt-3">
        <span className="font-medium tabular-nums">{formatCents(dish.priceCents)}</span>
        <Button size="sm" variant={added ? 'secondary' : 'default'} disabled={added} onClick={onAdd}>
          {added ? (
            <>
              <Check className="size-4" /> Added
            </>
          ) : (
            'Add'
          )}
        </Button>
      </div>
    </div>
  );
}

export function OrderForm({ existing }: { existing?: OrderDetailDto }) {
  const router = useRouter();
  const { data: me } = useMe();
  const meta = useMeta().data;
  const canOverride = hasPermission(me, 'orders.override');

  const [employee, setEmployee] = useState<EmployeeSearchItemDto | null>(
    existing
      ? { id: existing.employee.id, name: existing.employee.name, email: existing.employee.email, companyId: existing.company.id, companyName: existing.company.name }
      : null,
  );
  const [date, setDate] = useState<string | null>(existing?.deliveryDate ?? null);
  const [time, setTime] = useState<string | undefined>(existing?.deliveryTime);
  const [addressId, setAddressId] = useState<string | undefined>(existing?.address.id);
  const [packagingTypeId, setPackagingTypeId] = useState<string | undefined>(existing?.packagingType.id);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [lines, setLines] = useState<LineState[]>(() => (existing ? linesFromOrder(existing) : []));
  const [serverIssues, setServerIssues] = useState<FieldMessage[]>([]);
  const [secretSlug, setSecretSlug] = useState<string | null>(null);

  const ctx = useOrderingContext(employee?.id ?? null);
  const calendar = useOrderingCalendar(employee?.id ?? null);
  const menu = useEmployeeMenu(employee?.id ?? null);

  const dishById = useMemo(() => {
    const map = new Map<string, MenuDishDto>();
    for (const c of [...(menu.data?.listed ?? []), ...(menu.data?.secret ?? [])]) for (const i of c.items) map.set(i.dish.id, i.dish);
    return map;
  }, [menu.data]);

  const payload: OrderInput | null = useMemo(() => {
    if (!employee || !date) return null;
    return {
      employeeId: employee.id,
      deliveryDate: date,
      ...(time ? { deliveryTime: time } : {}),
      ...(addressId ? { addressId } : {}),
      ...(packagingTypeId ? { packagingTypeId } : {}),
      notes,
      lines: toPayloadLines(lines),
    };
  }, [employee, date, time, addressId, packagingTypeId, notes, lines]);

  // Debounce the live quote so typing quantities doesn't fire a request per keystroke.
  const [quoteInput, setQuoteInput] = useState<OrderInput | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setQuoteInput(payload), 400);
    return () => clearTimeout(t);
  }, [payload]);
  const quote = useQuote(quoteInput);

  const issues = serverIssues.length > 0 ? serverIssues : (quote.data?.issues ?? []);
  const warnings = quote.data?.warnings ?? [];
  const fieldIssue = (field: string) => issues.filter((i) => i.path[0] === field);

  const create = useCreateOrder();
  const update = useUpdateOrder(existing?.id ?? '');
  const saving = create.isPending || update.isPending;

  const submit = async (intent: 'DRAFT' | 'PLACE' | 'SAVE') => {
    if (!payload) return;
    setServerIssues([]);
    try {
      const result = existing
        ? await update.mutateAsync({
            version: existing.version,
            deliveryDate: payload.deliveryDate,
            deliveryTime: payload.deliveryTime,
            addressId: payload.addressId,
            packagingTypeId: payload.packagingTypeId,
            notes: payload.notes,
            lines: payload.lines,
            ...(intent === 'SAVE' ? {} : { intent }),
          })
        : await create.mutateAsync({ ...payload, intent: intent === 'SAVE' ? 'PLACE' : intent });
      toast.success(
        `${formatOrderNumber(result.order.number)} ${result.order.status === 'DRAFT' ? 'saved as draft' : result.order.status === 'CONFIRMED' ? 'confirmed' : existing ? 'updated' : 'placed'}`,
      );
      router.push(`/orders/${result.order.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.issues.length > 0) setServerIssues(err.issues);
        toast.error(err.message);
      } else toast.error('Could not save the order.');
    }
  };

  const addDish = (dish: MenuDishDto) => {
    const qty = dish.minOrderQty ?? 1;
    setLines((ls) => [...ls, { key: newKey(), dishId: dish.id, quantity: qty, combos: [{ key: newKey(), quantity: qty, choices: defaultChoices(dish) }] }]);
  };

  const selectedDay = calendar.data?.find((d) => d.date === date);
  const lockedSelected = !!selectedDay?.locked;
  const isDraftOrNew = !existing || existing.status === 'DRAFT';
  const zone = meta?.kitchenTimeZone ?? 'Asia/Kolkata';
  const times = ctx.data ? timesInWindow(ctx.data.deliveryWindow.start, ctx.data.deliveryWindow.end, ctx.data.deliveryWindow.stepMinutes) : [];

  const renderCategory = (cat: MenuCategoryDto) => (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cat.items.map(({ dish }) => (
        <DishCard key={dish.id} dish={dish} added={lines.some((l) => l.dishId === dish.id)} onAdd={() => addDish(dish)} />
      ))}
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-6">
        {/* 1. Employee */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">1 · Employee</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {existing ? (
              <p className="text-sm">
                <span className="font-medium">{existing.employee.name}</span> · {existing.company.name}
              </p>
            ) : (
              <EmployeePicker
                value={employee}
                onChange={(e) => {
                  setEmployee(e);
                  setLines([]);
                  setDate(null);
                  setTime(undefined);
                  setAddressId(undefined);
                  setPackagingTypeId(undefined);
                  setServerIssues([]);
                }}
              />
            )}
            {ctx.data && (
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">{ctx.data.company.name}</Badge>
                <Badge variant="secondary">Tier: {ctx.data.company.tierName}</Badge>
                {ctx.data.employee.allergens.map((a) => (
                  <Badge key={a} variant="outline" className="border-amber-400 text-amber-800 dark:text-amber-200">
                    Allergy: {a}
                  </Badge>
                ))}
                {ctx.data.employee.dietaryPreferences.map((d) => (
                  <Badge key={d} variant="outline">
                    Prefers {d}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 2. Date */}
        {employee && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">2 · Delivery date</CardTitle>
            </CardHeader>
            <CardContent>
              {existing && existing.status === 'CONFIRMED' ? (
                <p className="text-sm">{formatDate(existing.deliveryDate, { weekday: 'long', day: 'numeric', month: 'long' })} (fixed after confirmation)</p>
              ) : (
                <DateStrip days={calendar.data} value={date} onChange={setDate} canOverride={canOverride} zone={zone} />
              )}
              {fieldIssue('deliveryDate').map((m, i) => (
                <p key={i} className="mt-2 text-sm text-destructive">
                  {m.message}
                </p>
              ))}
              {lockedSelected && canOverride && isDraftOrNew && (
                <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                  The cut-off for this date has passed. As an admin you can still place the order; it will be confirmed straight away.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* 3. Delivery */}
        {employee && ctx.data && date && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">3 · Delivery</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Time (IST)</Label>
                {ctx.data.employee.canChangeDeliveryTime ? (
                  <Select value={time ?? ctx.data.company.defaultDeliveryTime} onValueChange={setTime}>
                    <SelectTrigger className="w-full" aria-label="Delivery time">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {times.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                          {t === ctx.data.company.defaultDeliveryTime ? ' (default)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm">
                    {time ?? ctx.data.company.defaultDeliveryTime} <span className="text-muted-foreground">· company default</span>
                  </p>
                )}
                {fieldIssue('deliveryTime').map((m, i) => (
                  <p key={i} className="text-sm text-destructive">
                    {m.message}
                  </p>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label>Address</Label>
                {ctx.data.employee.canChooseAddress ? (
                  <Select value={addressId ?? ctx.data.addresses.find((a) => a.isDefault)?.id} onValueChange={setAddressId}>
                    <SelectTrigger className="w-full" aria-label="Delivery address">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ctx.data.addresses.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm">{(ctx.data.addresses.find((a) => a.id === addressId) ?? ctx.data.addresses.find((a) => a.isDefault))?.label}</p>
                )}
                {fieldIssue('addressId').map((m, i) => (
                  <p key={i} className="text-sm text-destructive">
                    {m.message}
                  </p>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label>Packaging</Label>
                {ctx.data.employee.canChangePackaging ? (
                  <Select value={packagingTypeId ?? ctx.data.packagingTypes.find((p) => p.isDefault)?.id} onValueChange={setPackagingTypeId}>
                    <SelectTrigger className="w-full" aria-label="Packaging">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ctx.data.packagingTypes.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm">{(ctx.data.packagingTypes.find((p) => p.id === packagingTypeId) ?? ctx.data.packagingTypes.find((p) => p.isDefault))?.name}</p>
                )}
                {fieldIssue('packagingTypeId').map((m, i) => (
                  <p key={i} className="text-sm text-destructive">
                    {m.message}
                  </p>
                ))}
              </div>
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="notes">Notes for the kitchen / driver</Label>
                <Textarea id="notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* 4. Menu */}
        {employee && date && (
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">4 · {ctx.data?.employee.name.split(' ')[0]}’s menu</CardTitle>
              {menu.data && <span className="text-xs text-muted-foreground">Priced on {menu.data.tier.name}</span>}
            </CardHeader>
            <CardContent>
              {!menu.data ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <Tabs defaultValue={menu.data.listed[0]?.id}>
                  <TabsList className="flex h-auto flex-wrap justify-start">
                    {menu.data.listed.map((c) => (
                      <TabsTrigger key={c.id} value={c.id}>
                        {c.name}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {menu.data.listed.map((c) => (
                    <TabsContent key={c.id} value={c.id} className="pt-3">
                      {renderCategory(c)}
                    </TabsContent>
                  ))}
                </Tabs>
              )}
              {menu.data && menu.data.secret.length > 0 && (
                <div className="mt-4 rounded-lg border border-dashed p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Eye className="size-4 text-muted-foreground" aria-hidden />
                    <span className="text-sm">Unlisted categories (reachable by link):</span>
                    {menu.data.secret.map((c) => (
                      <Button key={c.id} size="sm" variant={secretSlug === c.slug ? 'secondary' : 'outline'} onClick={() => setSecretSlug(secretSlug === c.slug ? null : c.slug)}>
                        {c.name}
                      </Button>
                    ))}
                  </div>
                  {menu.data.secret
                    .filter((c) => c.slug === secretSlug)
                    .map((c) => (
                      <div key={c.id} className="pt-3">
                        {renderCategory(c)}
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 5. Lines */}
        {lines.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-base font-semibold">5 · Dishes and combinations</h2>
            {lines.map((line, i) => (
              <LineEditor
                key={line.key}
                index={i}
                line={line}
                dish={dishById.get(line.dishId)}
                issues={issues}
                warnings={warnings}
                onChange={(next) => setLines((ls) => ls.map((l) => (l.key === line.key ? next : l)))}
                onRemove={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
              />
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              Order summary
              {quote.isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Updating" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!payload && <p className="text-muted-foreground">Choose an employee and a delivery date.</p>}
            {quote.data?.lines.map((l) => (
              <div key={l.dishId}>
                <div className="flex justify-between font-medium">
                  <span>
                    {l.dishName} × {l.quantity}
                  </span>
                  <span className="tabular-nums">{formatCents(l.lineTotalCents)}</span>
                </div>
                {l.combinations.map((c, i) => (
                  <div key={i} className="flex justify-between pl-3 text-xs text-muted-foreground">
                    <span className="pr-2">
                      {c.quantity} × {c.label || 'as served'} @ {formatCents(c.unitPriceCents)}
                    </span>
                    <span className="tabular-nums">{formatCents(c.totalCents)}</span>
                  </div>
                ))}
              </div>
            ))}
            {payload && (
              <div className="flex justify-between border-t pt-3 text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatCents(quote.data?.totalCents ?? 0)}</span>
              </div>
            )}
            {payload && <p className="text-xs text-muted-foreground">Pre-tax, billed to the company. Prices from the server.</p>}
            {issues.length > 0 && payload && (
              <div className="rounded-md bg-destructive/10 p-2 text-destructive">
                {issues.length} problem{issues.length === 1 ? '' : 's'} to fix before placing.
              </div>
            )}
            {warnings.length > 0 && (
              <div className="flex gap-1.5 rounded-md bg-amber-100 p-2 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {warnings.length} allergy/diet warning{warnings.length === 1 ? '' : 's'} (shown on the dishes)
              </div>
            )}
            <div className={cn('grid gap-2 pt-1', isDraftOrNew ? 'grid-cols-2' : 'grid-cols-1')}>
              {isDraftOrNew ? (
                <>
                  <Button variant="outline" disabled={!payload || saving || lockedSelected} onClick={() => submit('DRAFT')}>
                    Save draft
                  </Button>
                  <Button disabled={!payload || saving || lines.length === 0} onClick={() => submit('PLACE')}>
                    {saving && <Loader2 className="size-4 animate-spin" />}
                    Place order
                  </Button>
                </>
              ) : (
                <Button disabled={!payload || saving} onClick={() => submit('SAVE')}>
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  Save changes
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
