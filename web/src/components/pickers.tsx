import { useEffect } from 'react';
import { flat, useOwners, useProperties } from '../lib/queries';
import type { Page } from '../lib/types';

// shortcut: a native select over every row is fine for the target firms (up to ~300 properties); switch to a searchable combobox past ~1,000.
const PICK = { limit: 100 } as const;

/** Follows the cursor to the end so the picker lists the whole portfolio, not just the newest 100. */
function useAll<T>(q: { data?: { pages: Page<T>[] }; hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => Promise<unknown> }): T[] {
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  return flat(q.data);
}

export function PropertySelect({ value, onChange, label = 'Property', all = 'All properties', id }: { value: string; onChange: (v: string) => void; label?: string; all?: string | null; id?: string }) {
  const rows = useAll(useProperties(PICK));
  return (
    <select id={id} className="select" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {all !== null && <option value="">{all}</option>}
      {rows.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nameRef}
        </option>
      ))}
    </select>
  );
}

export function OwnerSelect({ value, onChange, all = 'All owners', id, required }: { value: string; onChange: (v: string) => void; all?: string | null; id?: string; required?: boolean }) {
  const rows = useAll(useOwners(PICK));
  return (
    <select id={id} className="select" aria-label="Owner" value={value} onChange={(e) => onChange(e.target.value)} required={required}>
      {all !== null && <option value="">{all}</option>}
      {rows.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
