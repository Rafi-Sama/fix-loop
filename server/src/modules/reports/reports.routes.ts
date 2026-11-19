/** Maintenance reports (PRD §9). Every report filters by date range, property and owner; CSV via ?format=csv. */
import { and, desc, eq, gte, inArray, isNull, lt, sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { attachments, categories, expenses, maintenanceRequests, properties, units, vendors, workOrders } from '../../db/schema/index.js';
import { ts } from '../../db/sql.js';
import { toCsv } from '../../lib/csv.js';
import { assertFound } from '../../lib/errors.js';
import { withUrls } from '../files/files.service.js';
import { idParams } from '../../lib/validation.js';
import { orgTx } from '../../shared/http.js';

const DAY = 86_400_000;
const range = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    propertyId: z.uuid().optional(),
    ownerId: z.uuid().optional(),
    format: z.enum(['json', 'csv']).default('json'),
  })
  .transform((q) => {
    const to = q.to ? new Date(`${q.to}T00:00:00Z`).getTime() + DAY : Date.now();
    const from = q.from ? new Date(`${q.from}T00:00:00Z`).getTime() : to - 90 * DAY;
    return { ...q, fromDate: new Date(from), toDate: new Date(to) };
  })
  .refine((q) => q.toDate > q.fromDate, 'from must be before to')
  .refine((q) => q.toDate.getTime() - q.fromDate.getTime() <= 3 * 366 * DAY, 'Range can be at most 3 years');
type Range = z.infer<typeof range>;

/** Property/owner filter on a query that already joins `properties`. */
const scope = (q: Range): (SQL | undefined)[] => [q.propertyId ? eq(properties.id, q.propertyId) : undefined, q.ownerId ? eq(properties.ownerId, q.ownerId) : undefined];
const hours = (expr: SQL) => sql<number | null>`round((extract(epoch from ${expr}) / 3600)::numeric, 1)::float8`;

export const reportRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  const send = <T extends Record<string, string | number | null | Date>>(
    reply: { header: (k: string, v: string) => unknown },
    format: 'json' | 'csv',
    name: string,
    json: unknown,
    rows: T[],
    columns: { key: keyof T; header: string }[],
  ) => {
    if (format === 'json') return json;
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="${name}.csv"`);
    return toCsv(rows, columns);
  };

  // Maintenance Summary: totals, completed, pending, overdue, average/median completion and approval time.
  app.get('/summary', { schema: { querystring: range } }, async (req, reply) => {
    const q = req.query;
    const r = await orgTx(app, req, async (tx) => {
      const [row] = await tx.execute<Record<string, number | null>>(sql`
        with reqs as (
          select r.* from ${maintenanceRequests} r
          join ${units} u on u.id = r.unit_id join ${properties} p on p.id = u.property_id
          where r.created_at >= ${ts(q.fromDate)} and r.created_at < ${ts(q.toDate)}
            ${q.propertyId ? sql`and p.id = ${q.propertyId}` : sql``}
            ${q.ownerId ? sql`and p.owner_id = ${q.ownerId}` : sql``}
        ),
        -- A work order is created after its request, so the created_at bound is exact and lets an index skip older jobs.
        wos as (
          select w.*, r.created_at as request_created_at from reqs r
          join ${workOrders} w on w.request_id = r.id where w.created_at >= ${ts(q.fromDate)}
        ),
        closed as (
          select extract(epoch from w.closed_at - w.request_created_at) / 3600 as h from wos w where w.status = 'closed'
        ),
        appr as (
          select extract(epoch from a.decided_at - qt.created_at) / 3600 as h
          from wos w join approvals a on a.work_order_id = w.id join quotes qt on qt.id = a.quote_id
          where a.decision = 'approved' and a.approver_type <> 'auto'
        )
        select
          (select count(*)::int from reqs) as "totalRequests",
          (select count(*)::int from reqs where status = 'resolved') as "completedRequests",
          (select count(*)::int from reqs where status in ('new','needs_info','in_progress')) as "pendingRequests",
          (select count(distinct w.request_id)::int from wos w
             where w.status not in ('closed','cancelled','completed') and w.expected_completion_at < now()) as "overdueRequests",
          (select round(avg(h)::numeric, 1)::float8 from closed) as "avgCompletionHours",
          (select round((percentile_cont(0.5) within group (order by h))::numeric, 1)::float8 from closed) as "medianCompletionHours",
          (select round((percentile_cont(0.5) within group (order by h))::numeric, 1)::float8 from appr) as "medianApprovalHours"`);
      return row!;
    });
    return send(reply, q.format, 'maintenance-summary', r, [r as Record<string, number | null>], Object.keys(r).map((k) => ({ key: k, header: k })));
  });

  // Vendor Performance: assigned, completed, avg response, avg completion, overdue.
  app.get('/vendors', { schema: { querystring: range } }, async (req, reply) => {
    const q = req.query;
    const rows = await orgTx(app, req, (tx) =>
      tx
        .select({
          vendorId: vendors.id,
          vendor: vendors.companyName,
          jobsAssigned: sql<number>`count(*)::int`,
          jobsCompleted: sql<number>`count(*) filter (where ${workOrders.status} in ('completed','closed'))::int`,
          avgResponseHours: hours(sql`avg(${workOrders.acceptedAt} - ${workOrders.assignedAt})`),
          avgCompletionHours: hours(sql`avg(${workOrders.completedAt} - ${workOrders.assignedAt})`),
          overdueJobs: sql<number>`count(*) filter (where ${workOrders.status} not in ('closed','cancelled','completed') and ${workOrders.expectedCompletionAt} < now())::int`,
        })
        .from(workOrders)
        .innerJoin(vendors, eq(vendors.id, workOrders.vendorId))
        .innerJoin(units, eq(units.id, workOrders.unitId))
        .innerJoin(properties, eq(properties.id, units.propertyId))
        .where(and(gte(workOrders.assignedAt, q.fromDate), lt(workOrders.assignedAt, q.toDate), ...scope(q)))
        .groupBy(vendors.id, vendors.companyName)
        .orderBy(desc(sql`count(*)`)),
    );
    return send(reply, q.format, 'vendor-performance', { items: rows }, rows, [
      { key: 'vendor', header: 'Vendor' },
      { key: 'jobsAssigned', header: 'Jobs assigned' },
      { key: 'jobsCompleted', header: 'Jobs completed' },
      { key: 'avgResponseHours', header: 'Avg response (h)' },
      { key: 'avgCompletionHours', header: 'Avg completion (h)' },
      { key: 'overdueJobs', header: 'Overdue jobs' },
    ]);
  });

  // Financial: total, by property, by category, by vendor, monthly trend.
  app.get('/financial', { schema: { querystring: range } }, async (req, reply) => {
    const q = req.query;
    const r = await orgTx(app, req, async (tx) => {
      const where = and(gte(expenses.incurredOn, q.fromDate), lt(expenses.incurredOn, q.toDate), ...scope(q));
      const base = () => tx.select({ totalCents: sql<number>`sum(${expenses.amountCents})::int` }).from(expenses).innerJoin(properties, eq(properties.id, expenses.propertyId));
      const [[total], byProperty, byCategory, byVendor, monthly] = await Promise.all([
        base().where(where),
        tx.select({ propertyId: properties.id, property: properties.nameRef, totalCents: sql<number>`sum(${expenses.amountCents})::int` }).from(expenses).innerJoin(properties, eq(properties.id, expenses.propertyId)).where(where).groupBy(properties.id, properties.nameRef).orderBy(desc(sql`3`)),
        tx.select({ category: categories.name, totalCents: sql<number>`sum(${expenses.amountCents})::int` }).from(expenses).innerJoin(properties, eq(properties.id, expenses.propertyId)).innerJoin(categories, eq(categories.id, expenses.categoryId)).where(where).groupBy(categories.name).orderBy(desc(sql`2`)),
        tx.select({ vendor: vendors.companyName, totalCents: sql<number>`sum(${expenses.amountCents})::int` }).from(expenses).innerJoin(properties, eq(properties.id, expenses.propertyId)).leftJoin(vendors, eq(vendors.id, expenses.vendorId)).where(where).groupBy(vendors.companyName).orderBy(desc(sql`2`)),
        tx.select({ month: sql<string>`to_char(date_trunc('month', ${expenses.incurredOn}), 'YYYY-MM')`, totalCents: sql<number>`sum(${expenses.amountCents})::int` }).from(expenses).innerJoin(properties, eq(properties.id, expenses.propertyId)).where(where).groupBy(sql`1`).orderBy(sql`1`),
      ]);
      return { totalCents: total?.totalCents ?? 0, byProperty, byCategory, byVendor, monthly };
    });
    return send(reply, q.format, 'financial', r, r.monthly, [
      { key: 'month', header: 'Month' },
      { key: 'totalCents', header: 'Total (cents)' },
    ]);
  });

  // Property Maintenance Report: the owner-facing record.
  app.get('/properties/:id', { schema: { params: idParams, querystring: range } }, async (req, reply) => {
    const q = req.query;
    const r = await orgTx(app, req, async (tx) => {
      const [p] = await tx.select().from(properties).where(eq(properties.id, req.params.id));
      assertFound(p, 'Property');
      const jobs = await tx
        .select({
          workOrderId: workOrders.id,
          ref: workOrders.ref,
          unit: units.label,
          issue: maintenanceRequests.title,
          repair: workOrders.description,
          completionNotes: workOrders.completionNotes,
          vendor: vendors.companyName,
          vendorPhone: vendors.phone,
          completedAt: workOrders.closedAt,
          costCents: expenses.amountCents,
          billTo: expenses.billTo,
        })
        .from(workOrders)
        .innerJoin(units, eq(units.id, workOrders.unitId))
        .innerJoin(maintenanceRequests, eq(maintenanceRequests.id, workOrders.requestId))
        .leftJoin(vendors, eq(vendors.id, workOrders.vendorId))
        .leftJoin(expenses, eq(expenses.workOrderId, workOrders.id))
        .where(and(eq(units.propertyId, p.id), eq(workOrders.status, 'closed'), gte(workOrders.closedAt, q.fromDate), lt(workOrders.closedAt, q.toDate)))
        .orderBy(desc(workOrders.closedAt));
      const files = jobs.length
        ? await tx
            .select({ subjectId: attachments.subjectId, id: attachments.id, kind: attachments.kind, mime: attachments.mime, fileKey: attachments.fileKey })
            .from(attachments)
            .where(and(eq(attachments.subjectType, 'work_order'), inArray(attachments.subjectId, jobs.map((j) => j.workOrderId)), inArray(attachments.kind, ['completion_photo', 'invoice']), eq(attachments.uploaded, true)))
        : [];
      const byJob = Map.groupBy(await withUrls(app.storage, files), (f) => f.subjectId);
      return {
        property: { id: p.id, nameRef: p.nameRef, address: `${p.addressLine}, ${p.city}, ${p.state} ${p.zip}` },
        jobs: jobs.map((j) => ({ ...j, files: (byJob.get(j.workOrderId) ?? []).map(({ id, kind, mime, url }) => ({ id, kind, mime, url })) })),
        totalCents: jobs.reduce((s, j) => s + (j.costCents ?? 0), 0),
      };
    });
    return send(reply, q.format, `property-${r.property.id}`, r, r.jobs.map(({ files: _files, ...j }) => j), [
      { key: 'ref', header: 'Work order' },
      { key: 'unit', header: 'Unit' },
      { key: 'issue', header: 'Issue' },
      { key: 'repair', header: 'Repair' },
      { key: 'vendor', header: 'Contractor' },
      { key: 'completedAt', header: 'Completed' },
      { key: 'costCents', header: 'Cost (cents)' },
      { key: 'billTo', header: 'Bill to' },
    ]);
  });

  // Expense export for bill entry in the PMS (business-strategy §2).
  // GET is read-only; POST also marks the rows as exported (state changes never ride on GET).
  const expenseQuery = range.and(z.object({ unexportedOnly: z.enum(['true', 'false']).default('false') }));
  const exportExpenses = (req: Parameters<typeof orgTx>[1], q: z.infer<typeof expenseQuery>, mark: boolean) =>
    orgTx(app, req, async (tx) => {
      const where = and(gte(expenses.incurredOn, q.fromDate), lt(expenses.incurredOn, q.toDate), q.unexportedOnly === 'true' ? isNull(expenses.exportedAt) : undefined, ...scope(q));
      const out = await tx
        .select({
          id: expenses.id,
          date: sql<string>`to_char(${expenses.incurredOn}, 'YYYY-MM-DD')`,
          workOrder: workOrders.ref,
          property: properties.nameRef,
          propertyExternalId: properties.externalId,
          unit: units.label,
          vendor: vendors.companyName,
          vendorExternalId: vendors.externalId,
          category: categories.name,
          amount: sql<string>`to_char(${expenses.amountCents} / 100.0, 'FM999999990.00')`,
          billTo: expenses.billTo,
          memo: workOrders.description,
        })
        .from(expenses)
        .innerJoin(workOrders, eq(workOrders.id, expenses.workOrderId))
        .innerJoin(properties, eq(properties.id, expenses.propertyId))
        .innerJoin(units, eq(units.id, expenses.unitId))
        .innerJoin(categories, eq(categories.id, expenses.categoryId))
        .leftJoin(vendors, eq(vendors.id, expenses.vendorId))
        .where(where)
        .orderBy(expenses.incurredOn)
        .limit(10_000);
      if (mark && out.length) await tx.update(expenses).set({ exportedAt: new Date() }).where(inArray(expenses.id, out.map((r) => r.id)));
      return toCsv(out, [
        { key: 'date', header: 'Date' },
        { key: 'workOrder', header: 'Work order' },
        { key: 'property', header: 'Property' },
        { key: 'propertyExternalId', header: 'Property ID (PMS)' },
        { key: 'unit', header: 'Unit' },
        { key: 'vendor', header: 'Vendor' },
        { key: 'vendorExternalId', header: 'Vendor ID (PMS)' },
        { key: 'category', header: 'Category' },
        { key: 'amount', header: 'Amount' },
        { key: 'billTo', header: 'Bill to' },
        { key: 'memo', header: 'Memo' },
      ]);
    });
  const csvHeaders = (reply: { header: (k: string, v: string) => unknown }) => {
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', 'attachment; filename="expenses.csv"');
  };
  app.get('/expenses.csv', { schema: { querystring: expenseQuery } }, async (req, reply) => {
    csvHeaders(reply);
    return exportExpenses(req, req.query, false);
  });
  app.post('/expenses/export', { schema: { querystring: expenseQuery } }, async (req, reply) => {
    csvHeaders(reply);
    return exportExpenses(req, req.query, true);
  });
};
