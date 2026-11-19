import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { ts } from '../../db/sql.js';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { maintenanceRequests, organizations, properties, units, vendors, workOrders } from '../../db/schema/index.js';
import { orgTx } from '../../shared/http.js';
import { slaFor } from '../work-orders/policy.js';
import { OPEN_STATUSES, waitingOn, type WoStatus } from '../work-orders/state-machine.js';

const HOUR = 3_600_000;

export const dashboardRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get('/', { schema: { querystring: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }) } }, async (req) =>
    orgTx(app, req, async (tx, actor) => {
      const since = new Date(Date.now() - req.query.days * 24 * HOUR);
      const now = new Date();
      // All 8 PRD §2 tiles in one round trip.
      const [tiles] = await tx.execute<Record<string, number>>(sql`
        select
          (select count(*)::int from ${properties} where archived_at is null) as "totalProperties",
          (select count(*)::int from ${maintenanceRequests} where created_at >= ${ts(since)}) as "totalRequests",
          (select count(*)::int from ${maintenanceRequests} where status in ('new','needs_info','in_progress')) as "openRequests",
          count(*) filter (where status = 'awaiting_acceptance')::int as "awaitingAcceptance",
          count(*) filter (where status in ('scheduled','in_progress'))::int as "inProgress",
          count(*) filter (where status = 'awaiting_approval')::int as "awaitingApproval",
          count(*) filter (where status = 'completed')::int as "awaitingReview",
          count(*) filter (where status = 'closed' and closed_at >= ${ts(since)})::int as "closedThisPeriod",
          count(*) filter (where status not in ('closed','cancelled','completed') and expected_completion_at < ${ts(now)})::int as "overdue"
        from ${workOrders}
        -- Only rows a tile can count, so the status index skips the growing closed history (closing sets status_changed_at = closed_at).
        where status in ${sql.raw(`('${OPEN_STATUSES.join("','")}')`)} or (status = 'closed' and status_changed_at >= ${ts(since)})`);

      const [org] = await tx.select({ slaConfig: organizations.slaConfig }).from(organizations).where(eq(organizations.id, actor.orgId));
      const open = await tx
        .select({
          id: workOrders.id,
          ref: workOrders.ref,
          status: workOrders.status,
          priority: workOrders.priority,
          // The queue shows one ellipsised line; don't ship whole tenant write-ups on every poll.
          description: sql<string>`left(${workOrders.description}, 160)`,
          approvalPendingWith: workOrders.approvalPendingWith,
          statusChangedAt: workOrders.statusChangedAt,
          expectedCompletionAt: workOrders.expectedCompletionAt,
          address: properties.addressLine,
          unitLabel: units.label,
          vendorName: vendors.companyName,
        })
        .from(workOrders)
        .innerJoin(units, eq(units.id, workOrders.unitId))
        .innerJoin(properties, eq(properties.id, units.propertyId))
        .leftJoin(vendors, eq(vendors.id, workOrders.vendorId))
        .where(inArray(workOrders.status, OPEN_STATUSES as WoStatus[]))
        .orderBy(asc(workOrders.statusChangedAt))
        .limit(500);

      const needsInfo = await tx
        .select({ id: maintenanceRequests.id, ref: maintenanceRequests.ref, title: maintenanceRequests.title, statusChangedAt: maintenanceRequests.statusChangedAt })
        .from(maintenanceRequests)
        .where(and(eq(maintenanceRequests.status, 'needs_info')))
        .orderBy(asc(maintenanceRequests.statusChangedAt))
        .limit(200);

      const queue = open.map((w) => {
        const who = w.approvalPendingWith === 'owner' ? 'owner' : waitingOn(w.status);
        const waitedHours = (now.getTime() - w.statusChangedAt.getTime()) / HOUR;
        const overdue = w.expectedCompletionAt !== null && w.expectedCompletionAt < now && w.status !== 'completed';
        const slowAccept = w.status === 'awaiting_acceptance' && waitedHours > slaFor(w.priority, org?.slaConfig ?? {}).assignHours;
        return { ...w, waitingOn: who, waitedHours: Math.round(waitedHours * 10) / 10, atRisk: overdue || slowAccept };
      });
      const group = (who: string) => queue.filter((q) => q.waitingOn === who && !q.atRisk);

      return {
        tiles,
        queue: {
          atRisk: queue.filter((q) => q.atRisk).sort((a, b) => b.waitedHours - a.waitedHours),
          you: group('pm'),
          vendor: group('vendor'),
          owner: group('owner'),
          tenant: needsInfo.map((r) => ({ ...r, waitedHours: Math.round(((now.getTime() - r.statusChangedAt.getTime()) / HOUR) * 10) / 10 })),
        },
      };
    }),
  );
};
