import { sql } from 'drizzle-orm';
import type { Tx } from '../db/client.js';

/**
 * Next reference number, e.g. MR-2026-001. A single upsert row-locks the counter,
 * so concurrent requests serialise on it and never collide; the sequence resets each year.
 */
export async function nextRef(tx: Tx, orgId: string, kind: 'MR' | 'WO', now = new Date()): Promise<string> {
  const year = now.getUTCFullYear();
  const rows = await tx.execute<{ last_value: number }>(sql`
    insert into counters (org_id, kind, year, last_value) values (${orgId}, ${kind}, ${year}, 1)
    on conflict (org_id, kind, year) do update set last_value = counters.last_value + 1
    returning last_value`);
  const n = rows[0]!.last_value;
  return `${kind}-${year}-${String(n).padStart(3, '0')}`;
}
