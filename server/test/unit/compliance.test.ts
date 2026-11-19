import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/modules/vendors/compliance.js';

const today = '2026-11-07';

describe('vendor compliance', () => {
  it('no insurance is missing', () => expect(evaluate([], today)).toBe('missing'));
  it('expired insurance is expired', () => expect(evaluate([{ type: 'insurance', expiresOn: '2026-11-06' }], today)).toBe('expired'));
  it('a renewal supersedes an expired certificate', () =>
    expect(evaluate([{ type: 'insurance', expiresOn: '2025-01-01' }, { type: 'insurance', expiresOn: '2027-06-01' }], today)).toBe('ok'));
  it('within 30 days is expiring', () => expect(evaluate([{ type: 'insurance', expiresOn: '2026-12-01' }], today)).toBe('expiring'));
  it('an expired licence on file blocks', () =>
    expect(evaluate([{ type: 'insurance', expiresOn: '2027-06-01' }, { type: 'license', expiresOn: '2026-01-01' }], today)).toBe('expired'));
  it('expiring today is still valid today', () => expect(evaluate([{ type: 'insurance', expiresOn: today }], today)).toBe('expiring'));
});
