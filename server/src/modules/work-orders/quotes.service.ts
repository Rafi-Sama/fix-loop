import { and, desc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import {
  approvals,
  quotes,
  workOrders,
} from '../../db/schema/index.js';
import { conflict, forbidden } from '../../lib/errors.js';
import { canReach } from '../../shared/outbox.js';
import { recordEvent } from '../../shared/timeline.js';
import { confirmedAttachments } from '../files/files.service.js';
import { revokeLinks } from '../links/links.service.js';
import { approvalThreshold, baseVars, loadWorkOrder, syncRequestStatus, type Ctx, type LoadedWo } from './context.js';
import { DAY_H, endEngagement, JOB_LINK, move, ownerParty, pmOnly, type quoteInput, toManagers, toParty, vendorParty, vendorStep } from './core.js';

export async function submitQuote(c: Ctx, id: string, input: z.infer<typeof quoteInput>) {
  const w = await loadWorkOrder(c.tx, id, { lock: true });
  const { onBehalfOf } = vendorStep(c, w);
  let fileKey: string | null = null;
  if (input.attachmentId) {
    const [file] = await confirmedAttachments(c.tx, { type: 'work_order', id }, [input.attachmentId], ['quote', 'document']);
    fileKey = file!.fileKey;
  }
  // Supersede the previous live quote; versions are kept as "historical quotations".
  const prev = await c.tx.select({ version: quotes.version }).from(quotes).where(eq(quotes.workOrderId, id)).orderBy(desc(quotes.version)).limit(1);
  await c.tx.update(quotes).set({ status: 'superseded' }).where(and(eq(quotes.workOrderId, id), eq(quotes.status, 'pending')));
  await revokeLinks(c.tx, c.org.id, id, { purposes: ['approval'] });
  const [quote] = await c.tx
    .insert(quotes)
    .values({ orgId: c.org.id, workOrderId: id, vendorId: w.wo.vendorId, amountCents: input.amountCents, description: input.description ?? null, fileKey, version: (prev[0]?.version ?? 0) + 1 })
    .returning();
  await move(c, w, { type: 'submit_quote' }, {
    event: 'wo.quote_submitted',
    set: { approvalPendingWith: 'pm' },
    payload: { quoteId: quote!.id, amountCents: input.amountCents, version: quote!.version },
    onBehalfOf,
  });
  const vars = { ...baseVars(c, w), amount: input.amountCents };
  // Auto-approve under the owner's threshold when the firm opted in (PRD §6.3).
  if (c.org.autoApproveUnderThreshold && input.amountCents <= approvalThreshold(c, w)) {
    await decide(c, w, quote!, { approverType: 'auto', decision: 'approved', channel: 'system', note: 'Under approval threshold' });
    return quote!;
  }
  await toManagers(c, w, { template: 'wo.quote_submitted.pm', vars });
  return quote!;
}

async function pendingQuote(c: Ctx, workOrderId: string) {
  const [q] = await c.tx.select().from(quotes).where(and(eq(quotes.workOrderId, workOrderId), eq(quotes.status, 'pending'))).for('update');
  if (!q) throw conflict('There is no pending quote');
  return q;
}

/** Records a decision and moves the job on when approved. */
async function decide(
  c: Ctx,
  w: LoadedWo,
  quote: typeof quotes.$inferSelect,
  d: { approverType: 'pm' | 'owner' | 'auto'; decision: 'approved' | 'declined' | 'call_me'; channel: 'app' | 'email_link' | 'sms_link' | 'phone' | 'system'; note?: string | null },
) {
  const approverId = d.approverType === 'owner' ? w.owner.id : d.approverType === 'pm' && c.actor.type === 'user' ? c.actor.id : null;
  await c.tx.insert(approvals).values({
    orgId: c.org.id,
    workOrderId: w.wo.id,
    quoteId: quote.id,
    approverType: d.approverType,
    approverId,
    decision: d.decision,
    note: d.note ?? null,
    amountCents: quote.amountCents,
    channel: d.channel,
  });
  const vars = { ...baseVars(c, w), amount: quote.amountCents, decision: d.decision.replace('_', ' '), approver: d.approverType, note: d.note ?? '' };
  if (d.decision === 'approved') {
    await c.tx.update(quotes).set({ status: 'approved' }).where(eq(quotes.id, quote.id));
    await revokeLinks(c.tx, c.org.id, w.wo.id, { purposes: ['approval'] });
    await move(c, w, { type: 'approve_quote' }, {
      event: 'wo.quote_approved',
      set: { approvedAmountCents: quote.amountCents },
      payload: { quoteId: quote.id, approverType: d.approverType, channel: d.channel, amountCents: quote.amountCents },
    });
    await toParty(c, w, vendorParty(w), { template: 'wo.approval_decided.vendor', vars, link: JOB_LINK, sms: true });
  } else {
    // Owner declined or wants a call: the decision goes back to the PM, the quote stays pending.
    await c.tx.update(workOrders).set({ approvalPendingWith: 'pm' }).where(eq(workOrders.id, w.wo.id));
    await recordEvent(c.tx, { subjectType: 'work_order', subjectId: w.wo.id, type: `wo.quote_${d.decision}`, actor: c.actor, payload: { quoteId: quote.id, note: d.note ?? null } });
  }
  if (d.approverType !== 'pm') await toManagers(c, w, { template: 'wo.approval_decided.pm', vars, sms: d.decision === 'call_me' });
}

/** PM decision. Above the owner's threshold the PM may only approve with the owner's offline OK. */
export async function pmDecideQuote(
  c: Ctx,
  id: string,
  input: { decision: 'approve' | 'reject'; next?: 'awaiting_quote' | 'draft' | 'cancelled'; ownerApprovedOffline?: boolean; note?: string | null },
) {
  pmOnly(c);
  const w = await loadWorkOrder(c.tx, id, { lock: true });
  if (w.wo.status !== 'awaiting_approval') throw conflict('Work order is not awaiting approval');
  const quote = await pendingQuote(c, id);
  if (input.decision === 'approve') {
    if (quote.amountCents > approvalThreshold(c, w) && !input.ownerApprovedOffline) {
      throw conflict('This quote is above the owner approval threshold', { code: 'owner_approval_required', thresholdCents: approvalThreshold(c, w) });
    }
    return decide(c, w, quote, {
      approverType: input.ownerApprovedOffline ? 'owner' : 'pm',
      decision: 'approved',
      channel: input.ownerApprovedOffline ? 'phone' : 'app',
      note: input.note ?? null,
    });
  }
  const next = input.next ?? 'awaiting_quote';
  await c.tx.update(quotes).set({ status: 'declined' }).where(eq(quotes.id, quote.id));
  await c.tx.insert(approvals).values({ orgId: c.org.id, workOrderId: id, quoteId: quote.id, approverType: 'pm', approverId: c.actor.type === 'user' ? c.actor.id : null, decision: 'declined', note: input.note ?? null, amountCents: quote.amountCents, channel: 'app' });
  await revokeLinks(c.tx, c.org.id, id, { purposes: ['approval'] });
  const vendorId = w.wo.vendorId;
  const vars = { ...baseVars(c, w), amount: quote.amountCents, decision: 'declined' };
  const vendor = vendorParty(w);
  await move(c, w, { type: 'reject_quote', next }, {
    event: 'wo.quote_rejected',
    payload: { quoteId: quote.id, next },
    set:
      next === 'draft'
        ? { vendorId: null, assignedAt: null, acceptedAt: null, approvedAmountCents: null }
        : next === 'cancelled'
          ? { cancelReason: input.note ?? 'Quote rejected' }
          : {},
  });
  await toParty(c, w, vendor, { template: 'wo.approval_decided.vendor', vars, ...(next === 'awaiting_quote' ? { link: JOB_LINK } : {}), sms: true });
  if (next !== 'awaiting_quote') {
    await endEngagement(c, id);
    if (next === 'cancelled') await revokeLinks(c.tx, c.org.id, id);
    else if (vendorId) await revokeLinks(c.tx, c.org.id, id, { subjectId: vendorId });
    await syncRequestStatus(c.tx, w.request.id, c.now);
  }
}

export async function sendToOwner(c: Ctx, id: string) {
  pmOnly(c);
  const w = await loadWorkOrder(c.tx, id, { lock: true });
  if (w.wo.status !== 'awaiting_approval') throw conflict('Work order is not awaiting approval');
  const quote = await pendingQuote(c, id);
  await c.tx.update(workOrders).set({ approvalPendingWith: 'owner' }).where(eq(workOrders.id, id));
  await recordEvent(c.tx, { subjectType: 'work_order', subjectId: id, type: 'wo.approval_requested', actor: c.actor, payload: { quoteId: quote.id, mode: w.owner.notifyMode } });
  // "PM forwards manually" owners get nothing from us; the PM records their decision with ownerApprovedOffline.
  if (w.owner.notifyMode === 'direct') {
    // Owners get approval links by email only (no SMS consent is recorded for them).
    if (!canReach(ownerParty(w), c.smsEnabled)) throw conflict('This owner has no email on file. Ask them by phone and record their decision.', { code: 'owner_unreachable' });
    await revokeLinks(c.tx, c.org.id, id, { purposes: ['approval'] });
    await toParty(c, w, ownerParty(w), {
      template: 'wo.approval_requested.owner',
      vars: { ...baseVars(c, w), amount: quote.amountCents },
      link: { purpose: 'approval', ttlHours: 14 * DAY_H },
    });
  }
}

export async function ownerDecide(c: Ctx, id: string, input: { decision: 'approved' | 'declined' | 'call_me'; note?: string | null }) {
  if (c.actor.type !== 'owner') throw forbidden();
  const w = await loadWorkOrder(c.tx, id, { lock: true });
  if (w.owner.id !== c.actor.id) throw forbidden();
  if (w.wo.status !== 'awaiting_approval' || w.wo.approvalPendingWith !== 'owner') throw conflict('This approval is no longer pending');
  const quote = await pendingQuote(c, id);
  await decide(c, w, quote, { approverType: 'owner', decision: input.decision, channel: 'email_link', note: input.note ?? null });
}
