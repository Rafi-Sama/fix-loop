import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

const prod = {
  NODE_ENV: 'production',
  APP_URL: 'https://app.example.com',
  DATABASE_URL: 'postgres://app_user:x@db/fixloop',
  DATABASE_OWNER_URL: 'postgres://owner:x@db/fixloop',
  S3_BUCKET: 'b',
  S3_ACCESS_KEY_ID: 'k',
  S3_SECRET_ACCESS_KEY: 's',
  EMAIL_FROM: 'n@example.com',
  EMAIL_PROVIDER: 'postmark',
  TRUST_PROXY: '1',
  POSTMARK_TOKEN: 't',
};

describe('production env guards', () => {
  it('accepts a complete production config', () => {
    expect(loadEnv(prod).LOG_LEVEL).toBe('info');
  });
  it.each([
    ['log email provider', { EMAIL_PROVIDER: 'log' }, 'EMAIL_PROVIDER'],
    ['http app url', { APP_URL: 'http://app.example.com' }, 'APP_URL'],
    ['API as owner role', { DATABASE_URL: 'postgres://owner:x@db/fixloop' }, 'DATABASE_URL'],
    ['no trusted proxy', { TRUST_PROXY: '0' }, 'TRUST_PROXY'],
  ])('rejects %s', (_name, patch, key) => {
    expect(() => loadEnv({ ...prod, ...patch })).toThrow(key);
  });
});
