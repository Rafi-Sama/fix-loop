import type { Env } from '../../config/env.js';

export interface SendResult {
  providerId: string;
}
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Template name, for the dev log provider only (never sent). */
  template?: string;
}
export interface Providers {
  email(m: EmailMessage): Promise<SendResult>;
  sms(to: string, body: string, template?: string): Promise<SendResult>;
}

/** Permanent failures (bad address, unsubscribed) shouldn't be retried. */
export class PermanentSendError extends Error {}

async function postJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return body;
  const msg = `${res.status} ${JSON.stringify(body).slice(0, 300)}`;
  // 4xx other than rate limiting won't succeed on retry.
  if (res.status >= 400 && res.status < 500 && res.status !== 429) throw new PermanentSendError(msg);
  throw new Error(msg);
}

export function createProviders(env: Env, log: (msg: string, data: object) => void): Providers {
  const email: Providers['email'] =
    env.EMAIL_PROVIDER === 'postmark'
      ? async (m) => {
          const r = await postJson('https://api.postmarkapp.com/email', {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Postmark-Server-Token': env.POSTMARK_TOKEN },
            body: JSON.stringify({ From: env.EMAIL_FROM, To: m.to, Subject: m.subject, TextBody: m.text, MessageStream: 'outbound' }),
          });
          return { providerId: String(r.MessageID ?? '') };
        }
      : async (m) => {
          log('email (log provider)', m);
          return { providerId: `log-${Date.now()}` };
        };

  const sms: Providers['sms'] =
    env.SMS_PROVIDER === 'twilio'
      ? async (to, body) => {
          const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
          const r = await postJson(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
            method: 'POST',
            headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ To: to, MessagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID, Body: body }),
          });
          return { providerId: String(r.sid ?? '') };
        }
      : async (to, body, template) => {
          log('sms (log provider)', { to, body, template });
          return { providerId: `log-${Date.now()}` };
        };

  return { email, sms };
}
