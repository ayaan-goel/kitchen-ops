'use client';

import { REFERENCE_KIND_LABELS, REFERENCE_KINDS, type ReferenceItemDto, type ReferenceKind } from '@fernleaf/shared';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Forbidden } from '@/components/forbidden';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { moved, useReference, useReferenceWrite } from '@/features/catalogue/api';
import { hasPermission, useMe } from '@/lib/auth';

const USAGE_HINT: Record<ReferenceKind, string> = {
  allergens: 'dishes, options and employees',
  'dietary-tags': 'dishes, options and employees',
  stations: 'dishes',
  'portion-sizes': 'option groups and options',
  'packaging-types': 'companies and orders',
};

function ReferenceData() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: me } = useMe();
  const kind = (REFERENCE_KINDS as readonly string[]).includes(params.get('kind') ?? '') ? (params.get('kind') as ReferenceKind) : 'allergens';
  if (me && !hasPermission(me, 'reference.read')) return <Forbidden />;

  return (
    <>
      <PageHeader
        title="Reference data"
        description="Lists used across the catalogue, kitchen and companies. Entries in use are deactivated rather than deleted, so history stays intact."
      />
      <Tabs value={kind} onValueChange={(k) => router.replace(`${pathname}?kind=${k}`)} className="mb-4">
        <TabsList className="h-auto flex-wrap">
          {REFERENCE_KINDS.map((k) => (
            <TabsTrigger key={k} value={k}>
              {REFERENCE_KIND_LABELS[k]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <ReferenceTable key={kind} kind={kind} canManage={hasPermission(me, 'reference.manage')} />
    </>
  );
}

function ReferenceTable({ kind, canManage }: { kind: ReferenceKind; canManage: boolean }) {
  const { data, isPending, error } = useReference(kind);
  const write = useReferenceWrite(kind);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const ids = data?.map((r) => r.id) ?? [];

  const add = () => {
    if (!newName.trim()) return;
    write.mutate({ type: 'create', name: newName.trim() }, { onSuccess: () => setNewName('') });
  };

  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="hidden sm:table-cell">Used by</TableHead>
            <TableHead className="w-24">Active</TableHead>
            {canManage && <TableHead className="w-32 text-right">Order</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending && (
            <TableRow>
              <TableCell colSpan={4}>
                <Skeleton className="h-24 w-full" />
              </TableCell>
            </TableRow>
          )}
          {error && (
            <TableRow>
              <TableCell colSpan={4} className="text-sm text-destructive">
                {error.message}
              </TableCell>
            </TableRow>
          )}
          {data?.map((row: ReferenceItemDto) => (
            <TableRow key={row.id} className={row.isActive ? undefined : 'opacity-60'}>
              <TableCell>
                {editing?.id === row.id ? (
                  <form
                    className="flex items-center gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      write.mutate({ type: 'update', id: row.id, name: editing.name }, { onSuccess: () => setEditing(null) });
                    }}
                  >
                    <Input value={editing.name} autoFocus onChange={(e) => setEditing({ id: row.id, name: e.target.value })} className="h-8" aria-label="Name" />
                    <Button type="submit" size="icon" variant="ghost" aria-label="Save name">
                      <Check className="size-4" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Cancel" onClick={() => setEditing(null)}>
                      <X className="size-4" />
                    </Button>
                  </form>
                ) : (
                  <span className="flex items-center gap-1">
                    <span className="font-medium">{row.name}</span>
                    {row.description && <span className="text-xs text-muted-foreground">· {row.description}</span>}
                    {canManage && (
                      <Button size="icon" variant="ghost" className="size-7" aria-label={`Rename ${row.name}`} onClick={() => setEditing({ id: row.id, name: row.name })}>
                        <Pencil className="size-3.5" />
                      </Button>
                    )}
                  </span>
                )}
              </TableCell>
              <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                {row.usage > 0 ? `${row.usage} ${USAGE_HINT[kind]}` : 'Not used yet'}
              </TableCell>
              <TableCell>
                <Switch
                  checked={row.isActive}
                  disabled={!canManage}
                  aria-label={`${row.name} active`}
                  onCheckedChange={(v) => write.mutate({ type: 'update', id: row.id, isActive: v })}
                />
              </TableCell>
              {canManage && (
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" className="size-7" aria-label="Move up" disabled={ids[0] === row.id} onClick={() => write.mutate({ type: 'reorder', ids: moved(ids, row.id, -1) })}>
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-7" aria-label="Move down" disabled={ids.at(-1) === row.id} onClick={() => write.mutate({ type: 'reorder', ids: moved(ids, row.id, 1) })}>
                    <ArrowDown className="size-3.5" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {canManage && (
        <form
          className="flex gap-2 border-t p-3"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`New ${REFERENCE_KIND_LABELS[kind].toLowerCase().replace(/s$/, '')}`} aria-label="New entry name" />
          <Button type="submit" disabled={!newName.trim() || write.isPending}>
            <Plus className="size-4" /> Add
          </Button>
        </form>
      )}
    </div>
  );
}

export default function ReferenceDataPage() {
  return (
    <Suspense>
      <ReferenceData />
    </Suspense>
  );
}
