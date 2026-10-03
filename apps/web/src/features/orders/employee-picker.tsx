'use client';

import type { EmployeeSearchItemDto } from '@fernleaf/shared';
import { Check, Search, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useEmployeeSearch } from './api';

export function EmployeePicker({
  value,
  onChange,
}: {
  value: EmployeeSearchItemDto | null;
  onChange: (employee: EmployeeSearchItemDto) => void;
}) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  const { data, isFetching } = useEmployeeSearch(q);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={value ? `${value.name} · ${value.companyName}` : 'Search employee by name, email or company'}
            className="pl-8"
            aria-label="Employee"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {data?.length === 0 && <p className="p-3 text-sm text-muted-foreground">No employees found.</p>}
        <ul className="max-h-72 overflow-y-auto" role="listbox" aria-busy={isFetching}>
          {data?.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                role="option"
                aria-selected={value?.id === e.id}
                onClick={() => {
                  onChange(e);
                  setText('');
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent',
                  value?.id === e.id && 'bg-accent',
                )}
              >
                <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{e.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {e.email} · {e.companyName}
                  </span>
                </span>
                {value?.id === e.id && <Check className="size-4" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
