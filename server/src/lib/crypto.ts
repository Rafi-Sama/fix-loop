import { createHash, randomBytes } from 'node:crypto';

/** 256-bit URL-safe random token. Only its hash is ever stored. */
export const randomToken = (): string => randomBytes(32).toString('base64url');

/** Tokens are high-entropy, so a fast unsalted hash is sufficient (and lets us index the lookup). */
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Tokens we mint are exactly 43 base64url chars; reject anything else before touching the DB. */
export const isWellFormedToken = (token: string): boolean => /^[A-Za-z0-9_-]{43}$/.test(token);
