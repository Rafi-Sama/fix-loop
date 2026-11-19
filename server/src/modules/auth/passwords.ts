import { createHash } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';

// OWASP argon2id baseline (m=19 MiB, t=2, p=1).
const OPTS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const passwordSchema = z.string().min(10, 'Use at least 10 characters').max(128);

export const hashPassword = (pw: string) => hash(pw, OPTS);
export const verifyPassword = (hashed: string, pw: string) => verify(hashed, pw).catch(() => false);

// Verified against when the user doesn't exist, so response time doesn't reveal which emails have accounts.
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword('not-a-real-password-for-timing'));

/**
 * Have I Been Pwned k-anonymity check: only the first 5 hex chars of the SHA-1 leave the server.
 * Fails open (returns false) on network errors so an outage never blocks sign-up.
 */
export async function isBreachedPassword(pw: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const sha1 = createHash('sha1').update(pw).digest('hex').toUpperCase();
  try {
    const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const suffix = sha1.slice(5);
    return (await res.text()).split('\n').some((line) => {
      const [s, count] = line.trim().split(':');
      return s === suffix && Number(count) > 0;
    });
  } catch {
    return false;
  }
}
