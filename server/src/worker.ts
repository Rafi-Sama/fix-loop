import { setTimeout as sleep } from 'node:timers/promises';
import pino from 'pino';
import { env } from './config/env.js';
import { createDatabase } from './db/client.js';
import { cleanup } from './jobs/cleanup.js';
import { dispatchNotifications } from './jobs/dispatch.js';
import { processReminders } from './jobs/reminders.js';
import { createStorage } from './modules/files/storage.js';
import { createProviders } from './modules/notifications/providers.js';

const log = pino({ level: env.LOG_LEVEL, ...(env.NODE_ENV === 'production' ? {} : { transport: { target: 'pino-pretty' } }) });
// The worker crosses orgs, so it uses the owner role (not subject to RLS). It never serves user input.
const { db, close } = createDatabase(env.DATABASE_OWNER_URL, { max: 5, appName: 'fixloop-worker' });
const storage = createStorage(env);
// Dev "inbox" (log providers): one line per message with its link, which `pnpm links` reads; full text at LOG_LEVEL=debug.
const providers = createProviders(env, (msg, data) => {
  const m = data as { to: string; subject?: string; text?: string; body?: string; template?: string };
  const text = m.text ?? m.body ?? '';
  const link = /https?:\/\/\S+\/l\/[A-Za-z0-9_-]+/.exec(text)?.[0];
  log.info(`${msg.split(' ')[0]} → ${m.to} · ${m.template ?? '?'} · ${m.subject ?? text.slice(0, 70)}${link ? ` · ${link}` : ''}`);
  log.debug({ text }, msg);
});

const POLL_MS = 2_000;
const CLEANUP_EVERY_MS = 15 * 60_000;
let stopping = false;

async function loop() {
  let lastCleanup = 0;
  while (!stopping) {
    try {
      const fired = await processReminders(db, new Date(), (err, id) => log.error({ err, reminderId: id }, 'reminder failed; retired'));
      const sent = await dispatchNotifications(db, providers, env.APP_URL);
      if (fired || sent) log.debug({ fired, sent }, 'worker tick');
      if (Date.now() - lastCleanup > CLEANUP_EVERY_MS) {
        lastCleanup = Date.now();
        const removed = await cleanup(db, storage);
        if (removed.files) log.info(removed, 'cleanup');
      }
      // Busy queue: go again immediately; idle: back off.
      if (!sent && !fired) await sleep(POLL_MS);
    } catch (err) {
      log.error({ err }, 'worker tick failed');
      await sleep(POLL_MS * 5);
    }
  }
}

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    log.info({ sig }, 'stopping worker after current batch');
    stopping = true;
  });
}

await loop();
await close();
