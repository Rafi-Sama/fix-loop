import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, totpCode, totpStep, verifyTotp } from '../../src/lib/totp.js';

// RFC 6238 appendix B, SHA-1 secret "12345678901234567890", 8 digits truncated to the 6 we use.
const SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('totp', () => {
  it('base32 round-trips', () => {
    expect(base32Decode(SECRET).toString()).toBe('12345678901234567890');
    expect(SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('matches the RFC vector at t=%i', (t, code) => {
    expect(totpCode(SECRET, totpStep(t * 1000))).toBe(code);
  });
  it('accepts ±1 step, rejects replays and wrong codes', () => {
    const now = 1234567890_000;
    const step = totpStep(now);
    expect(verifyTotp(SECRET, totpCode(SECRET, step), 0, now)).toBe(step);
    expect(verifyTotp(SECRET, totpCode(SECRET, step - 1), 0, now)).toBe(step - 1);
    expect(verifyTotp(SECRET, totpCode(SECRET, step - 2), 0, now)).toBeNull();
    expect(verifyTotp(SECRET, totpCode(SECRET, step), step, now)).toBeNull();
    expect(verifyTotp(SECRET, '12345', 0, now)).toBeNull();
    expect(verifyTotp(SECRET, 'abcdef', 0, now)).toBeNull();
  });
});
