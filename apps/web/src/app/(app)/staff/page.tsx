'use client';

import type { StaffDto } from '@fernleaf/shared';
import { KeyRound, Loader2, Plus } from 'lucide-react';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useRoles, useStaff, useStaffWrite } from '@/features/admin/api';
import { errorText } from '@/features/catalogue/api';
import { hasPermission, useMe } from '@/lib/auth';
import { formatKitchen, useMeta } from '@/lib/kitchen-time';

/** Staff accounts and roles (ACC-01…04). Roles are data: what each can do is listed under Roles. */
export default function StaffPage() {
  const { data: me } = useMe();
  const zone = useMeta().data?.kitchenTimeZone ?? 'Asia/Kolkata';
  const { data, isPending, error } = useStaff();
  const roles = useRoles().data ?? [];
  const write = useStaffWrite();
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<StaffDto | null>(null);
  if (me && !hasPermission(me, 'staff.read')) return <Forbidden />;
  const canManage = hasPermission(me, 'staff.manage');
  const patch = (s: StaffDto, body: Record<string, unknown>, ok: string) =>
    write.mutate({ path: `/${s.id}`, method: 'PATCH', body }, { onSuccess: () => toast.success(ok), onError: (err) => toast.error(errorText(err)) });

  return (
    <>
      <PageHeader
        title="Staff"
        description="Everyone who signs in. Changing someone’s role, deactivating them or resetting their password signs them out everywhere."
        actions={
          canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New staff member
            </Button>
          ) : undefined
        }
      />
      <div className="mb-8 rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden lg:table-cell">Last sign-in</TableHead>
              <TableHead>Active</TableHead>
              {canManage && <TableHead />}
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
            {data?.map((s) => {
              const self = s.id === me?.user.id;
              return (
                <TableRow key={s.id} className={s.isActive ? undefined : 'opacity-60'}>
                  <TableCell className="font-medium">
                    {s.name}
                    {self && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{s.email}</TableCell>
                  <TableCell>
                    {canManage && !self ? (
                      <Select value={s.role.id} onValueChange={(roleId) => patch(s, { roleId }, `${s.name} is now ${roles.find((r) => r.id === roleId)?.name}`)}>
                        <SelectTrigger size="sm" className="w-36" aria-label={`Role of ${s.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roles.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm">{s.role.name}</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {s.lastLoginAt ? formatKitchen(s.lastLoginAt, zone, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : 'Never'}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={s.isActive}
                      disabled={!canManage || self}
                      aria-label={`${s.name} active`}
                      onCheckedChange={(v) => patch(s, { isActive: v }, v ? `${s.name} reactivated` : `${s.name} deactivated and signed out`)}
                    />
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setResetting(s)}>
                        <KeyRound className="size-3.5" /> Reset password
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <h2 className="mb-2 font-semibold">Roles</h2>
      <p className="mb-3 text-sm text-muted-foreground">Access is granted by permission, never by role name, so a new role is just a new row with its permissions.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {roles.map((r) => (
          <div key={r.id} className="rounded-xl border bg-card p-4">
            <p className="font-medium">
              {r.name} <span className="text-xs font-normal text-muted-foreground">· {r.staff} {r.staff === 1 ? 'person' : 'people'}</span>
            </p>
            {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
            <p className="mt-2 flex flex-wrap gap-1">
              {r.permissions.map((p) => (
                <span key={p} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                  {p}
                </span>
              ))}
            </p>
          </div>
        ))}
      </div>
      {creating && <CreateStaffDialog onClose={() => setCreating(false)} />}
      {resetting && <ResetPasswordDialog staff={resetting} onClose={() => setResetting(null)} />}
    </>
  );
}

function CreateStaffDialog({ onClose }: { onClose: () => void }) {
  const roles = useRoles().data ?? [];
  const write = useStaffWrite();
  const [f, setF] = useState({ name: '', email: '', phone: '', roleId: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const submit = () =>
    write.mutate(
      { path: '', method: 'POST', body: { ...f, phone: f.phone || null } },
      { onSuccess: () => (toast.success(`Account created. Share the password with ${f.name} securely.`), onClose()), onError: (err) => setError(errorText(err)) },
    );
  const input = (k: 'name' | 'email' | 'phone' | 'password', label: string, type = 'text') => (
    <div className="space-y-1.5">
      <Label htmlFor={`s-${k}`}>{label}</Label>
      <Input id={`s-${k}`} type={type} autoComplete={k === 'password' ? 'new-password' : 'off'} value={f[k]} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} />
    </div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New staff member</DialogTitle>
          <DialogDescription>You set the first password; there are no invitation emails (A-37).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {input('name', 'Name')}
            {input('phone', 'Phone (optional)')}
          </div>
          {input('email', 'Email', 'email')}
          <div className="space-y-1.5">
            <Label htmlFor="s-role">Role</Label>
            <Select value={f.roleId} onValueChange={(v) => setF((p) => ({ ...p, roleId: v }))}>
              <SelectTrigger id="s-role" className="w-full">
                <SelectValue placeholder="Choose a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {input('password', 'Initial password (8+ characters)', 'password')}
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
          <Button onClick={submit} disabled={write.isPending || !f.name || !f.email || !f.roleId || f.password.length < 8}>
            {write.isPending && <Loader2 className="size-4 animate-spin" />} Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ staff, onClose }: { staff: StaffDto; onClose: () => void }) {
  const write = useStaffWrite();
  const [password, setPassword] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password for {staff.name}</DialogTitle>
          <DialogDescription>They’ll be signed out everywhere and must use the new password.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="r-pass">New password (8+ characters)</Label>
          <Input id="r-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={password.length < 8 || write.isPending}
            onClick={() =>
              write.mutate(
                { path: `/${staff.id}/password`, method: 'POST', body: { password } },
                { onSuccess: () => (toast.success('Password reset'), onClose()), onError: (err) => toast.error(errorText(err)) },
              )
            }
          >
            Reset password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
