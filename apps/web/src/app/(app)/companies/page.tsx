'use client';

import { AlertTriangle, Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Forbidden } from '@/components/forbidden';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompanies, useCreateCompany } from '@/features/admin/api';
import { workingDaysText } from '@/features/admin/format';
import { errorText } from '@/features/catalogue/api';
import { hasPermission, useMe } from '@/lib/auth';

export default function CompaniesPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const { data, isPending, error } = useCompanies();
  const [creating, setCreating] = useState(false);
  if (me && !hasPermission(me, 'companies.read')) return <Forbidden />;

  return (
    <>
      <PageHeader
        title="Companies"
        description="Client companies: who is billed, which tier prices them, where and when food is delivered, and which email domains identify their employees."
        actions={
          hasPermission(me, 'companies.manage') ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New company
            </Button>
          ) : undefined
        }
      />
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead className="hidden md:table-cell">Domains</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead className="text-right">Employees</TableHead>
              <TableHead className="hidden lg:table-cell">Delivery days</TableHead>
              <TableHead className="hidden lg:table-cell">Owner</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-24 w-full" />
                </TableCell>
              </TableRow>
            )}
            {error && (
              <TableRow>
                <TableCell colSpan={6} className="text-sm text-destructive">
                  {error.message}
                </TableCell>
              </TableRow>
            )}
            {data?.map((c) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`/companies/${c.id}`)}>
                <TableCell className="font-medium">
                  <Link href={`/companies/${c.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{c.domains.map((d) => `@${d}`).join(', ')}</TableCell>
                <TableCell className="text-sm">
                  {c.tierName}
                  {c.usesDefaultTier && <span className="text-muted-foreground"> (default)</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.employees}</TableCell>
                <TableCell className="hidden text-sm lg:table-cell">{workingDaysText(c.workingDays)}</TableCell>
                <TableCell className="hidden text-sm lg:table-cell">
                  {c.ownerName ?? (
                    <span className="inline-flex items-center gap-1 text-status-risk">
                      <AlertTriangle className="size-3.5" aria-hidden /> Not set
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {creating && <CreateCompanyDialog onClose={() => setCreating(false)} />}
    </>
  );
}

function CreateCompanyDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const create = useCreateCompany();
  const [f, setF] = useState({ name: '', domain: '', billingContactName: '', billingEmail: '' });
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    try {
      const c = await create.mutateAsync(f);
      toast.success(`${c.name} created. Add an address and employees next.`);
      router.push(`/companies/${c.id}`);
    } catch (err) {
      setError(errorText(err));
    }
  };
  const field = (key: keyof typeof f, label: string, placeholder: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`nc-${key}`}>{label}</Label>
      <Input id={`nc-${key}`} value={f[key]} placeholder={placeholder} onChange={(e) => setF((p) => ({ ...p, [key]: e.target.value }))} />
    </div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New company</DialogTitle>
          <DialogDescription>Start with the name, an email domain and a billing contact. Delivery details, addresses and the owner come next.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {field('name', 'Company name', 'Acme Analytics')}
          {field('domain', 'Email domain', 'acme.com')}
          <div className="grid gap-3 sm:grid-cols-2">
            {field('billingContactName', 'Billing contact', 'Priya Nair')}
            {field('billingEmail', 'Billing email', 'accounts@acme.com')}
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
          <Button onClick={submit} disabled={create.isPending || Object.values(f).some((v) => !v.trim())}>
            {create.isPending && <Loader2 className="size-4 animate-spin" />} Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
