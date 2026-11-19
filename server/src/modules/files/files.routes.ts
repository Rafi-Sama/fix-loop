import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Tx } from '../../db/client.js';
import { maintenanceRequests, vendors, workOrders } from '../../db/schema/index.js';
import { assertFound } from '../../lib/errors.js';
import { idParams } from '../../lib/validation.js';
import { orgTx } from '../../shared/http.js';
import { completeUpload, downloadUrl, startUpload, uploadRequest, type AttachmentSubject } from './files.service.js';

const subjectSchema = z.object({ type: z.enum(['request', 'work_order', 'vendor']), id: z.uuid() });
const KIND_BY_SUBJECT = {
  request: ['issue_photo', 'document'],
  work_order: ['issue_photo', 'completion_photo', 'quote', 'invoice', 'document'],
  vendor: ['document'],
} as const;

async function assertSubject(tx: Tx, s: AttachmentSubject) {
  const table = s.type === 'request' ? maintenanceRequests : s.type === 'work_order' ? workOrders : vendors;
  const [row] = await tx.select({ id: table.id }).from(table).where(eq(table.id, s.id));
  assertFound(row, 'Subject');
}

export const filesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.post(
    '/uploads',
    {
      schema: {
        body: uploadRequest.extend({
          subject: subjectSchema,
          kind: z.enum(['issue_photo', 'completion_photo', 'quote', 'invoice', 'document']),
        }),
      },
    },
    async (req, reply) => {
      const { subject, kind, ...file } = req.body;
      if (!(KIND_BY_SUBJECT[subject.type] as readonly string[]).includes(kind)) {
        return reply.status(400).send({ error: { code: 'bad_request', message: `Kind ${kind} is not allowed on a ${subject.type}` } });
      }
      const r = await orgTx(app, req, async (tx, actor) => {
        await assertSubject(tx, subject);
        return startUpload(tx, app.storage, actor, subject, kind, file);
      });
      return reply.status(201).send(r);
    },
  );

  app.post('/uploads/:id/complete', { schema: { params: idParams, body: z.object({ subject: subjectSchema }) } }, async (req) =>
    orgTx(app, req, async (tx) => {
      const a = await completeUpload(tx, app.storage, req.params.id, req.body.subject);
      return { id: a.id, kind: a.kind, mime: a.mime, sizeBytes: a.sizeBytes };
    }),
  );

  app.get('/:id/url', { schema: { params: idParams } }, async (req) =>
    orgTx(app, req, async (tx) => ({ url: await downloadUrl(tx, app.storage, req.params.id) })),
  );
};
