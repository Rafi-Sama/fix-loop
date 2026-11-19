import { randomBytes } from 'node:crypto';
import { ts } from '../../db/sql.js';
import { and, desc, eq, gt, ne, sql } from 'drizzle-orm';
import { withOrg, type Db, type Tx } from '../../db/client.js';
import { categories, organizations, sessions, users } from '../../db/schema/index.js';
import { hashToken, randomToken } from '../../lib/crypto.js';
import { AppError, badRequest, conflict, gone, tooMany, unauthorized } from '../../lib/errors.js';
import { logSecurity, type RequestMeta } from '../../shared/security-log.js';
import { notify } from '../../shared/outbox.js';
import { consumeLink, resolveLink } from '../links/links.service.js';
import { SESSION_TTL_MS } from '../../plugins/auth.js';
import { dummyHash, hashPassword, isBreachedPassword, verifyPassword } from './passwords.js';

const MAX_FAILED = 10;
const LOCK_MS = 15 * 60_000;

export const DEFAULT_CATEGORIES: { name: string; photoRequired: boolean; selfHelpKey?: string }[] = [
  { name: 'Plumbing', photoRequired: true, selfHelpKey: 'clogged_toilet' },
  { name: 'Electrical', photoRequired: false, selfHelpKey: 'breaker_gfci' },
  { name: 'HVAC', photoRequired: false, selfHelpKey: 'thermostat' },
  { name: 'Roofing', photoRequired: true },
  { name: 'Appliance repair', photoRequired: true, selfHelpKey: 'disposal_reset' },
  { name: 'Pest control', photoRequired: true },
  { name: 'Cleaning', photoRequired: false },
  { name: 'Painting', photoRequired: true },
  { name: 'General maintenance', photoRequired: true, selfHelpKey: 'smoke_alarm' },
  { name: 'Other', photoRequired: false },
];

export type SessionMeta = RequestMeta;

export const suspendedError = () => new AppError(403, 'org_suspended', 'This firm’s Fixloop account is suspended. Contact Fixloop support.');

/** Queue the "confirm your email" message (link valid 48 h). Caller is inside the user's org context. */
export async function queueVerification(tx: Tx, user: { id: string; orgId: string; email: string }) {
  await notify(
    tx,
    {
      orgId: user.orgId,
      to: { type: 'user', id: user.id, email: user.email, phone: null },
      template: 'user.verify_email',
      vars: {},
      subject: { type: 'user', id: user.id },
      link: { purpose: 'email_verify', scopeId: user.id, ttlHours: 48 },
    },
    false,
  );
}

async function createSession(db: Db | Tx, user: { id: string; orgId: string }, meta: SessionMeta) {
  const token = randomToken();
  await db.insert(sessions).values({
    userId: user.id,
    orgId: user.orgId,
    tokenHash: hashToken(token),
    ip: meta.ip,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

const slugify = (name: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'firm'}-${randomBytes(3).toString('hex')}`;

let breachCheckEnabled = true;
/** Tests and offline dev turn this off via PASSWORD_BREACH_CHECK=false. */
export const configureBreachCheck = (enabled: boolean) => {
  breachCheckEnabled = enabled;
};

async function assertStrongPassword(pw: string) {
  if (breachCheckEnabled && (await isBreachedPassword(pw))) throw badRequest('This password appears in known data breaches. Choose another.', { field: 'password' });
}

export async function signup(
  db: Db,
  input: { orgName: string; name: string; email: string; password: string },
  meta: SessionMeta,
) {
  await assertStrongPassword(input.password);
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [taken] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${input.email}`);
    if (taken) throw conflict('An account with this email already exists');
    const [org] = await tx.insert(organizations).values({ name: input.orgName, slug: slugify(input.orgName) }).returning();
    const [user] = await tx
      .insert(users)
      .values({ orgId: org!.id, email: input.email, name: input.name, role: 'admin', passwordHash })
      .returning();
    await tx.execute(sql`select set_config('app.org_id', ${org!.id}, true)`);
    await tx.insert(categories).values(DEFAULT_CATEGORIES.map((c, i) => ({ ...c, orgId: org!.id, sortOrder: i })));
    await queueVerification(tx, user!);
    await logSecurity(tx, { type: 'auth.signup', orgId: org!.id, userId: user!.id, email: user!.email, meta, detail: { orgName: org!.name } });
    const token = await createSession(tx, user!, meta);
    return { token, userId: user!.id, orgId: org!.id };
  });
}

export async function login(db: Db, input: { email: string; password: string }, meta: SessionMeta) {
  const [row] = await db
    .select({ user: users, suspendedAt: organizations.suspendedAt })
    .from(users)
    .innerJoin(organizations, eq(organizations.id, users.orgId))
    .where(sql`lower(${users.email}) = ${input.email}`);
  const user = row?.user;
  const failed = (reason: string) =>
    logSecurity(db, { type: 'auth.login_failed', orgId: user?.orgId, userId: user?.id, email: input.email, meta, detail: { reason } });
  if (!user?.passwordHash || !user.active) {
    await verifyPassword(await dummyHash(), input.password);
    await failed(!user ? 'unknown_email' : !user.active ? 'deactivated' : 'invite_pending');
    throw unauthorized('Invalid email or password');
  }
  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    await failed('locked');
    throw tooMany('Account temporarily locked after too many failed attempts');
  }

  if (!(await verifyPassword(user.passwordHash, input.password))) {
    // Atomic increment so parallel guesses can't race past the limit.
    const [n] = await db
      .update(users)
      .set({
        failedLogins: sql`${users.failedLogins} + 1`,
        lockedUntil: sql`case when ${users.failedLogins} + 1 >= ${MAX_FAILED} then ${ts(new Date(now.getTime() + LOCK_MS))} else ${users.lockedUntil} end`,
      })
      .where(eq(users.id, user.id))
      .returning({ failedLogins: users.failedLogins });
    await failed('bad_password');
    // >=: the count isn't reset when a lock expires, so the next failure re-locks and is logged too.
    if (n && n.failedLogins >= MAX_FAILED) await logSecurity(db, { type: 'auth.locked', orgId: user.orgId, userId: user.id, email: user.email, meta, detail: { minutes: LOCK_MS / 60_000 } });
    throw unauthorized('Invalid email or password');
  }
  // Checked after the password, so a suspension doesn't reveal which emails have accounts.
  if (row?.suspendedAt) {
    await failed('org_suspended');
    throw suspendedError();
  }
  if (user.failedLogins > 0 || user.lockedUntil) {
    await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
  }
  await logSecurity(db, { type: 'auth.login', orgId: user.orgId, userId: user.id, meta });
  return { token: await createSession(db, user, meta), userId: user.id, orgId: user.orgId };
}

export async function logout(db: Db, sessionId: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/** "Sign out everywhere": keep only the current session. */
export async function logoutOthers(db: Db, userId: string, keepSessionId: string) {
  await db.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)));
}

export function listSessions(db: Db, userId: string) {
  return db
    .select({ id: sessions.id, ip: sessions.ip, userAgent: sessions.userAgent, lastSeenAt: sessions.lastSeenAt, createdAt: sessions.createdAt })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastSeenAt));
}

export async function changePassword(db: Db, userId: string, sessionId: string, current: string, next: string, meta: SessionMeta) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, current))) throw unauthorized('Current password is wrong');
  await assertStrongPassword(next);
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, userId));
  await logoutOthers(db, userId, sessionId);
  await logSecurity(db, { type: 'auth.password_changed', orgId: user.orgId, userId, meta });
}

/** Always succeeds from the caller's view, so it can't be used to discover accounts. */
export async function requestPasswordReset(db: Db, email: string, meta: SessionMeta) {
  const [user] = await db
    .select({ id: users.id, orgId: users.orgId, email: users.email, phone: users.phone })
    .from(users)
    .where(and(sql`lower(${users.email}) = ${email}`, eq(users.active, true)));
  await logSecurity(db, { type: 'auth.password_reset_requested', orgId: user?.orgId, userId: user?.id, email, meta, detail: { matched: Boolean(user) } });
  if (!user) return;
  await withOrg(db, user.orgId, (tx) =>
    notify(
      tx,
      {
        orgId: user.orgId,
        to: { type: 'user', id: user.id, email: user.email, phone: user.phone },
        template: 'user.password_reset',
        vars: {},
        subject: { type: 'user', id: user.id },
        link: { purpose: 'password_reset', scopeId: user.id, ttlHours: 1 },
      },
      false,
    ),
  );
}

/** Completes an invite or a password reset: both set a password through a single-use link. */
export async function setPasswordWithLink(db: Db, token: string, password: string, meta: SessionMeta) {
  await assertStrongPassword(password);
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const link = await resolveLink(tx, token, ['user_invite', 'password_reset']);
    if (!(await consumeLink(tx, link.id))) throw gone();
    const [user] = await tx
      .update(users)
      // The link arrived by email, so this also proves the address.
      .set({ passwordHash, failedLogins: 0, lockedUntil: null, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
      .where(and(eq(users.id, link.subjectId), eq(users.orgId, link.orgId), eq(users.active, true)))
      .returning();
    if (!user) throw gone();
    const [org] = await tx.select({ suspendedAt: organizations.suspendedAt }).from(organizations).where(eq(organizations.id, user.orgId));
    if (org?.suspendedAt) throw suspendedError();
    await logSecurity(tx, { type: 'auth.password_set', orgId: user.orgId, userId: user.id, meta, detail: { via: link.purpose } });
    // A reset invalidates every existing session (the old password may be compromised).
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    return { token: await createSession(tx, user, meta), userId: user.id, orgId: user.orgId };
  });
}


/** "Confirm your email" link. Single-use; an already-verified user just gets a success. */
export async function verifyEmail(db: Db, token: string, meta: SessionMeta) {
  return db.transaction(async (tx) => {
    const link = await resolveLink(tx, token, ['email_verify']);
    // Like every other link of a suspended firm (the link page already shows it as inactive).
    const [org] = await tx.select({ suspendedAt: organizations.suspendedAt }).from(organizations).where(eq(organizations.id, link.orgId));
    if (org?.suspendedAt) throw gone('This link is no longer active');
    if (!(await consumeLink(tx, link.id))) throw gone();
    const [user] = await tx
      .update(users)
      .set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
      .where(and(eq(users.id, link.subjectId), eq(users.orgId, link.orgId)))
      .returning({ id: users.id, orgId: users.orgId });
    if (!user) throw gone();
    await logSecurity(tx, { type: 'auth.email_verified', orgId: user.orgId, userId: user.id, meta });
  });
}

/** Re-send the verification email. No-op once verified. */
export async function resendVerification(db: Db, userId: string, meta: SessionMeta | null, by?: { platformAdminId: string }) {
  const [user] = await db.select({ id: users.id, orgId: users.orgId, email: users.email, verified: users.emailVerifiedAt }).from(users).where(eq(users.id, userId));
  if (!user || user.verified) return false;
  await withOrg(db, user.orgId, async (tx) => {
    await queueVerification(tx, user);
    await logSecurity(tx, { type: by ? 'platform.verification_resent' : 'auth.verification_sent', orgId: user.orgId, userId: user.id, platformAdminId: by?.platformAdminId, meta: meta ?? undefined });
  });
  return true;
}
