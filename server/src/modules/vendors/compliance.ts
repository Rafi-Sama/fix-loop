import { and, inArray } from 'drizzle-orm';
import type { Tx } from '../../db/client.js';
import { vendorDocuments } from '../../db/schema/index.js';

export type ComplianceStatus = 'ok' | 'expiring' | 'expired' | 'missing';
const EXPIRING_DAYS = 30;

/** Latest expiry per document type; a renewal supersedes the old one. null expiry = never expires. */
const latestExpiry = (docs: { type: string; expiresOn: string | null }[], type: string): string | undefined =>
  docs
    .filter((d) => d.type === type)
    .map((d) => d.expiresOn ?? '9999-12-31')
    .sort()
    .at(-1);

/** Insurance is mandatory; a licence is optional but must be current if on file. Dates are ISO yyyy-mm-dd. */
export function evaluate(docs: { type: string; expiresOn: string | null }[], today: string): ComplianceStatus {
  const insurance = latestExpiry(docs, 'insurance');
  if (!insurance) return 'missing';
  const licence = latestExpiry(docs, 'license');
  if (insurance < today || (licence && licence < today)) return 'expired';
  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + EXPIRING_DAYS);
  const soonIso = soon.toISOString().slice(0, 10);
  return insurance <= soonIso || (licence !== undefined && licence <= soonIso) ? 'expiring' : 'ok';
}

export const todayUtc = (now = new Date()) => now.toISOString().slice(0, 10);

export async function complianceFor(tx: Tx, vendorIds: string[], now = new Date()): Promise<Map<string, ComplianceStatus>> {
  const out = new Map<string, ComplianceStatus>();
  if (vendorIds.length === 0) return out;
  const docs = await tx
    .select({ vendorId: vendorDocuments.vendorId, type: vendorDocuments.type, expiresOn: vendorDocuments.expiresOn })
    .from(vendorDocuments)
    .where(and(inArray(vendorDocuments.vendorId, vendorIds), inArray(vendorDocuments.type, ['insurance', 'license'])));
  const today = todayUtc(now);
  const byVendor = Map.groupBy(docs, (d) => d.vendorId);
  for (const id of vendorIds) out.set(id, evaluate(byVendor.get(id) ?? [], today));
  return out;
}

export async function complianceOf(tx: Tx, vendorId: string, now = new Date()): Promise<ComplianceStatus> {
  return (await complianceFor(tx, [vendorId], now)).get(vendorId)!;
}

