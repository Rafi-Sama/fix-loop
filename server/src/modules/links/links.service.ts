import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.js';
import { accessLinks, type LinkSpec } from '../../db/schema/index.js';
import { hashToken, isWellFormedToken, randomToken } from '../../lib/crypto.js';
import { gone, notFound } from '../../lib/errors.js';

export type LinkPurpose = LinkSpec['purpose'];
export type AccessLink = typeof accessLinks.$inferSelect;

const SINGLE_USE: ReadonlySet<LinkPurpose> = new Set(['user_invite', 'password_reset', 'email_verify']);
const HOUR = 3_600_000;

export async function mintLink(db: DbOrTx, orgId: string, spec: LinkSpec, now = new Date()): Promise<string> {
  const token = randomToken();
  await db.insert(accessLinks).values({
    orgId,
    tokenHash: hashToken(token),
    subjectType: spec.subjectType,
    subjectId: spec.subjectId,
    purpose: spec.purpose,
    scopeId: spec.scopeId,
    expiresAt: new Date(now.getTime() + spec.ttlHours * HOUR),
  });
  return token;
}

/**
 * Resolves a token to its link. Unknown and malformed tokens both 404 (no oracle);
 * expired/revoked/used ones 410 so the UI can say "ask for a new link".
 */
export async function resolveLink(db: DbOrTx, token: string, purposes: readonly LinkPurpose[], now = new Date()): Promise<AccessLink> {
  if (!isWellFormedToken(token)) throw notFound('Link');
  const [link] = await db.select().from(accessLinks).where(eq(accessLinks.tokenHash, hashToken(token)));
  if (!link || !purposes.includes(link.purpose)) throw notFound('Link');
  if (link.revokedAt || link.expiresAt <= now || (SINGLE_USE.has(link.purpose) && link.usedAt)) throw gone();
  // Throttled touch: at most one write per link per minute.
  if (!link.lastUsedAt || now.getTime() - link.lastUsedAt.getTime() > 60_000) {
    await db.update(accessLinks).set({ lastUsedAt: now }).where(eq(accessLinks.id, link.id));
  }
  return link;
}

/** Atomically consume a single-use link; false if someone else used it first. */
export async function consumeLink(db: DbOrTx, linkId: string, now = new Date()): Promise<boolean> {
  const rows = await db
    .update(accessLinks)
    .set({ usedAt: now })
    .where(and(eq(accessLinks.id, linkId), isNull(accessLinks.usedAt)))
    .returning({ id: accessLinks.id });
  return rows.length === 1;
}

/** Revoke live links on a scope, optionally only for one subject (e.g. the previously assigned vendor). */
export async function revokeLinks(
  db: DbOrTx,
  orgId: string,
  scopeId: string,
  opts: { subjectId?: string; purposes?: LinkPurpose[] } = {},
  now = new Date(),
): Promise<void> {
  await db
    .update(accessLinks)
    .set({ revokedAt: now })
    .where(
      and(
        eq(accessLinks.orgId, orgId),
        eq(accessLinks.scopeId, scopeId),
        isNull(accessLinks.revokedAt),
        opts.subjectId ? eq(accessLinks.subjectId, opts.subjectId) : sql`true`,
        opts.purposes?.length ? inArray(accessLinks.purpose, opts.purposes) : sql`true`,
      ),
    );
}

/** Revoke everything issued to a subject (tenant moved out, vendor deactivated). */
export async function revokeSubjectLinks(db: DbOrTx, orgId: string, subjectId: string, now = new Date()): Promise<void> {
  await db
    .update(accessLinks)
    .set({ revokedAt: now })
    .where(and(eq(accessLinks.orgId, orgId), eq(accessLinks.subjectId, subjectId), isNull(accessLinks.revokedAt)));
}

export const linkUrl = (appUrl: string, token: string) => `${appUrl.replace(/\/$/, '')}/l/${token}`;
