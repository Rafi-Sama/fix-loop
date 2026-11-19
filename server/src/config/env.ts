import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    // Default: 0.0.0.0 in production (containers), localhost otherwise.
    HOST: z.string().min(1).optional(),
    // `debug` also logs every request in development (production always does, at info).
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    // Number of reverse-proxy hops in front of the API (0 = direct). Only these hops' X-Forwarded-For is trusted,
    // so clients can't spoof their IP to dodge rate limits.
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    APP_URL: z.url(),
    DATABASE_URL: z.url(),
    DATABASE_OWNER_URL: z.url(),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    S3_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: bool,
    PASSWORD_BREACH_CHECK: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
    EMAIL_PROVIDER: z.enum(['log', 'postmark']).default('log'),
    POSTMARK_TOKEN: z.string().default(''),
    EMAIL_FROM: z.email(),
    SMS_PROVIDER: z.enum(['log', 'twilio']).default('log'),
    TWILIO_ACCOUNT_SID: z.string().default(''),
    TWILIO_AUTH_TOKEN: z.string().default(''),
    TWILIO_MESSAGING_SERVICE_SID: z.string().default(''),
  })
  .superRefine((e, ctx) => {
    if (e.EMAIL_PROVIDER === 'postmark' && !e.POSTMARK_TOKEN) {
      ctx.addIssue({ code: 'custom', path: ['POSTMARK_TOKEN'], message: 'required when EMAIL_PROVIDER=postmark' });
    }
    if (e.SMS_PROVIDER === 'twilio' && !(e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN && e.TWILIO_MESSAGING_SERVICE_SID)) {
      ctx.addIssue({ code: 'custom', path: ['TWILIO_ACCOUNT_SID'], message: 'Twilio credentials required when SMS_PROVIDER=twilio' });
    }
    if (e.NODE_ENV === 'production' && new URL(e.DATABASE_URL).username === new URL(e.DATABASE_OWNER_URL).username) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'the API must not connect as the owner role (it would bypass row-level security)' });
    }
    // The log provider would drop every email and write its link tokens into the logs.
    if (e.NODE_ENV === 'production' && e.EMAIL_PROVIDER === 'log') {
      ctx.addIssue({ code: 'custom', path: ['EMAIL_PROVIDER'], message: 'must be postmark in production' });
    }
    if (e.NODE_ENV === 'production' && !e.APP_URL.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', path: ['APP_URL'], message: 'must be https in production' });
    }
    // Behind nginx with 0, every client shares the proxy's IP: one user's typos lock everyone out of login.
    if (e.NODE_ENV === 'production' && e.TRUST_PROXY === 0) {
      ctx.addIssue({ code: 'custom', path: ['TRUST_PROXY'], message: 'must be ≥ 1 in production (the number of proxies in front of the API)' });
    }
  });

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
