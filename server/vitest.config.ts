import { defineConfig } from 'vitest/config';

const testEnv = {
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgres://app_user:app_user@localhost:5433/fixloop_test',
  DATABASE_OWNER_URL: 'postgres://owner:owner@localhost:5433/fixloop_test',
  S3_ENDPOINT: 'http://localhost:9100',
  S3_BUCKET: 'fixloop-test',
  S3_ACCESS_KEY_ID: 'minio',
  S3_SECRET_ACCESS_KEY: 'minio-secret',
  S3_FORCE_PATH_STYLE: 'true',
  EMAIL_FROM: 'test@example.com',
  PASSWORD_BREACH_CHECK: 'false',
};

export default defineConfig({
  test: {
    env: testEnv,
    globalSetup: ['test/global-setup.ts'],
    // Integration tests share one database; run files sequentially.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
