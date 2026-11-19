// RFC 6238 TOTP (SHA-1, 6 digits, 30 s): what Google Authenticator, 1Password, Authy etc. expect.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_S = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s.replace(/[\s=-]/g, '').toUpperCase()) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error('Invalid base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160-bit secret, base32 (what authenticator apps take as a "setup key"). */
export const newTotpSecret = () => base32Encode(randomBytes(20));

export const totpStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_S);

export function totpCode(secret: string, step: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1]! & 15;
  const bin = h.readUInt32BE(off) & 0x7fffffff;
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/**
 * The matched time step (accepting one step of clock drift either side), or null.
 * Callers store it and reject steps ≤ the last one used, so a code works once.
 */
export function verifyTotp(secret: string, code: string, lastStep: number, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const cur = totpStep(now);
  for (const step of [cur - 1, cur, cur + 1]) {
    if (step <= lastStep) continue;
    if (timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(code))) return step;
  }
  return null;
}

export const otpauthUri = (secret: string, account: string, issuer = 'Fixloop') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
