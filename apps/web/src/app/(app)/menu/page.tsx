'use client';

import type { MenuAdminCategoryDto } from '@fernleaf/shared';
import { ArrowDown, ArrowUp, EyeOff, Loader2, Lock, Pencil, Plus, Trash2, View } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Forbidden } from '@/components/forbidden';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { errorText, moved, useAllDishes, useMenuAdmin, useMenuWrite } from '@/features/catalogue/api';
import { hasPermission, useMe } from '@/lib/auth';

/** Menu categories and their dishes (MENU-01, MENU-03). Prices come from each company's tier. */
export default function MenuPage() {
  const { data: me } = useMe();
  const { data, isPending, error } = useMenuAdmin();
  const write = useMenuWrite();
  const [editing, setEditing] = useState<MenuAdminCategoryDto | 'new' | null>(null);
  if (me && !hasPermission(me, 'menu.read')) return <Forbidden />;
  const canManage = hasPermission(me, 'menu.manage');
  const ids = data?.map((c) => c.id) ?? [];
  const run = (op: Parameters<typeof write.mutate>[0], ok?: string) => write.mutate(op, { onSuccess: () => ok && toast.success(ok), onError: (err) => toast.error(errorText(err)) });

  return (
    <>
      <PageHeader
        title="Menu"
        description="What employees can order, by category. Secret categories are not listed but can be reached by link. Companies can hide categories or dishes on their own page."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/menu/preview">
                <View className="size-4" /> Preview as an employee
              </Link>
            </Button>
            {canManage && (
              <Button onClick={() => setEditing('new')}>
                <Plus className="size-4" /> New category
              </Button>
            )}
          </>
        }
      />
      {isPending && <Skeleton className="h-64 w-full" />}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      <div className="space-y-4">
        {data?.map((c) => (
          <section key={c.id} className={`rounded-xl border bg-card ${c.isActive ? '' : 'opacity-70'}`} aria-label={c.name}>
            <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
              <h2 className="font-semibold">{c.name}</h2>
              <span className="font-mono text-xs text-muted-foreground">/{c.slug}</span>
              {c.isSecret && (
                <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900 dark:bg-violet-950 dark:text-violet-200">
                  <Lock className="size-3" aria-hidden /> Secret (link only)
                </span>
              )}
              {!c.isActive && <span className="rounded-md bg-muted px-2 py-0.5 text-xs">Inactive</span>}
              {c.hiddenForCompanies > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <EyeOff className="size-3" aria-hidden /> hidden for {c.hiddenForCompanies} {c.hiddenForCompanies === 1 ? 'company' : 'companies'}
                </span>
              )}
              {canManage && (
                <span className="ml-auto flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="size-8" aria-label={`Move ${c.name} up`} disabled={ids[0] === c.id} onClick={() => run({ type: 'reorder', ids: moved(ids, c.id, -1) })}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-8" aria-label={`Move ${c.name} down`} disabled={ids.at(-1) === c.id} onClick={() => run({ type: 'reorder', ids: moved(ids, c.id, 1) })}>
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                </span>
              )}
            </header>
            <ul className="divide-y">
              {c.items.map((i) => {
                const itemIds = c.items.map((x) => x.id);
                return (
                  <li key={i.id} className={`flex flex-wrap items-center gap-2 px-4 py-2 text-sm ${i.isActive && i.dishActive ? '' : 'text-muted-foreground'}`}>
                    <span className="font-mono text-xs text-muted-foreground">{i.sku}</span>
                    <Link href={`/catalogue/dishes/${i.dishId}`} className="font-medium hover:underline">
                      {i.dishName}
                    </Link>
                    {!i.dishActive && <span className="text-xs">(dish inactive)</span>}
                    {canManage && (
                      <span className="ml-auto flex items-center gap-1">
                        <Switch checked={i.isActive} aria-label={`${i.dishName} shown`} onCheckedChange={(v) => run({ type: 'itemActive', id: i.id, isActive: v })} />
                        <Button size="icon" variant="ghost" className="size-7" aria-label="Move up" disabled={itemIds[0] === i.id} onClick={() => run({ type: 'reorderItems', categoryId: c.id, ids: moved(itemIds, i.id, -1) })}>
                          <ArrowUp className="size-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="size-7" aria-label="Move down" disabled={itemIds.at(-1) === i.id} onClick={() => run({ type: 'reorderItems', categoryId: c.id, ids: moved(itemIds, i.id, 1) })}>
                          <ArrowDown className="size-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="size-7" aria-label={`Remove ${i.dishName} from ${c.name}`} onClick={() => run({ type: 'removeItem', id: i.id }, `${i.dishName} removed from ${c.name}`)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </span>
                    )}
                  </li>
                );
              })}
              {c.items.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">No dishes yet.</li>}
            </ul>
            {canManage && <AddDish category={c} onAdd={(dishId) => run({ type: 'addItem', categoryId: c.id, dishId })} />}
          </section>
        ))}
      </div>
      {editing && <CategoryDialog category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function AddDish({ category, onAdd }: { category: MenuAdminCategoryDto; onAdd: (dishId: string) => void }) {
  const dishes = useAllDishes().data?.items ?? [];
  const placed = new Set(category.items.map((i) => i.dishId));
  const available = dishes.filter((d) => d.isActive && !placed.has(d.id));
  return (
    <div className="border-t px-4 py-2">
      <Select value="" onValueChange={onAdd}>
        <SelectTrigger size="sm" className="w-full sm:w-80" aria-label={`Add a dish to ${category.name}`}>
          <SelectValue placeholder="+ Add a dish…" />
        </SelectTrigger>
        <SelectContent>
          {available.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.sku} · {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CategoryDialog({ category, onClose }: { category: MenuAdminCategoryDto | null; onClose: () => void }) {
  const write = useMenuWrite();
  const [f, setF] = useState({
    name: category?.name ?? '',
    slug: category?.slug ?? '',
    description: category?.description ?? '',
    isActive: category?.isActive ?? true,
    isSecret: category?.isSecret ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const submit = () => {
    setError(null);
    write.mutate(category ? { type: 'update', id: category.id, input: f } : { type: 'create', input: f }, {
      onSuccess: () => {
        toast.success(category ? 'Category saved' : 'Category created');
        onClose();
      },
      onError: (err) => setError(errorText(err)),
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? `Edit ${category.name}` : 'New menu category'}</DialogTitle>
          <DialogDescription>Secret categories don’t appear in the list but anyone with the link (slug) can order from them.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="c-name">Name</Label>
            <Input id="c-name" value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value, slug: category || p.slug !== slugify(p.name) ? p.slug : slugify(e.target.value) }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-slug">Link name (slug)</Label>
            <Input id="c-slug" value={f.slug} onChange={(e) => setF((p) => ({ ...p, slug: e.target.value.toLowerCase() }))} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-desc">Description</Label>
            <Textarea id="c-desc" value={f.description} onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} rows={2} />
          </div>
          <div className="flex flex-wrap gap-6">
            <Label className="flex items-center gap-2 font-normal">
              <Switch checked={f.isActive} onCheckedChange={(v) => setF((p) => ({ ...p, isActive: v }))} /> Active
            </Label>
            <Label className="flex items-center gap-2 font-normal">
              <Switch checked={f.isSecret} onCheckedChange={(v) => setF((p) => ({ ...p, isSecret: v }))} /> Secret (link only)
            </Label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={write.isPending || !f.name.trim() || !f.slug.trim()}>
            {write.isPending && <Loader2 className="size-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
