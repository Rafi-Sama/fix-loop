// Manage Fixloop superadmins from a shell with database access. There is deliberately no web page that
// creates one: whoever can run this already controls the database.
//   pnpm superadmin add <email> "<name>"   new superadmin: prints a password and an authenticator setup key
//   pnpm superadmin reset <email>          new password + setup key, ends their sessions, clears lockout
//   pnpm superadmin disable|enable <email>
//   pnpm superadmin list
//   pnpm superadmin code <email>           current 6-digit code (development only)
import { randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { createDatabase } from '../db/client.js';
import { platformAdmins, platformSessions } from '../db/schema/index.js';
import { otpauthUri, newTotpSecret, totpCode, totpStep } from '../lib/totp.js';
import { hashPassword } from '../modules/auth/passwords.js';
import { logSecurity, type SecurityEventType } from '../shared/security-log.js';

const [cmd, rawEmail, ...rest] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const { db, close } = createDatabase(url, { max: 1, appName: 'fixloop-superadmin' });
const meta = { ip: 'cli', userAgent: `superadmin-cli (${process.env.USER ?? 'unknown'})` };
const log = (type: SecurityEventType, platformAdminId: string) => logSecurity(db, { type, platformAdminId, meta });

// 24 chars from a 54-char alphabet without look-alikes: ~138 bits.
const ALPHA = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newPassword = () => Array.from(randomBytes(24), (b) => ALPHA[b % ALPHA.length]).join('');

function printCredentials(addr: string, password: string, secret: string) {
  console.info(`\n  Email       ${addr}\n  Password    ${password}\n  Setup key   ${secret}\n  otpauth URI ${otpauthUri(secret, addr)}\n`);
  console.info('  Add the setup key to an authenticator app (1Password, Google Authenticator, Authy…), then sign in at /ops/login.');
  console.info('  Store the password in a password manager now. It is not shown again.\n');
}

async function find() {
  if (!email) throw new Error('Email required');
  const [a] = await db.select().from(platformAdmins).where(sql`lower(${platformAdmins.email}) = ${email}`);
  if (!a) throw new Error(`No superadmin ${email}`);
  return a;
}

try {
  switch (cmd) {
    case 'add': {
      const name = rest.join(' ').trim();
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) throw new Error('Usage: superadmin add <email> "<name>"');
      const password = newPassword();
      const secret = newTotpSecret();
      const [a] = await db.insert(platformAdmins).values({ email, name, passwordHash: await hashPassword(password), totpSecret: secret }).returning();
      await log('platform.admin_created', a!.id);
      printCredentials(email, password, secret);
      break;
    }
    case 'reset': {
      const a = await find();
      const password = newPassword();
      const secret = newTotpSecret();
      await db.update(platformAdmins).set({ passwordHash: await hashPassword(password), totpSecret: secret, totpLastStep: 0, failedLogins: 0, lockedUntil: null }).where(eq(platformAdmins.id, a.id));
      await db.delete(platformSessions).where(eq(platformSessions.adminId, a.id));
      await log('platform.admin_reset', a.id);
      printCredentials(a.email, password, secret);
      break;
    }
    case 'disable':
    case 'enable': {
      const a = await find();
      await db.update(platformAdmins).set({ active: cmd === 'enable' }).where(eq(platformAdmins.id, a.id));
      if (cmd === 'disable') await db.delete(platformSessions).where(eq(platformSessions.adminId, a.id));
      await log(cmd === 'enable' ? 'platform.admin_enabled' : 'platform.admin_disabled', a.id);
      console.info(`${a.email} ${cmd}d`);
      break;
    }
    case 'list': {
      const all = await db.select({ email: platformAdmins.email, name: platformAdmins.name, active: platformAdmins.active, lastLoginAt: platformAdmins.lastLoginAt }).from(platformAdmins);
      console.table(all);
      break;
    }
    case 'code': {
      if (process.env.NODE_ENV === 'production') throw new Error('Not available in production: use your authenticator app');
      const a = await find();
      console.info(totpCode(a.totpSecret, totpStep()));
      break;
    }
    default:
      throw new Error('Commands: add <email> "<name>" · reset <email> · disable <email> · enable <email> · list · code <email>');
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await close();
}
