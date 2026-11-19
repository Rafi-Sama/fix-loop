import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
  type PgColumn,
} from 'drizzle-orm/pg-core';
import { id, orgId, timestamps, tstz } from './_shared.js';
import { organizations } from './identity.js';
import { categories, tenants, units, vendors } from './portfolio.js';

export const priority = pgEnum('priority', ['emergency', 'high', 'normal', 'low']);
export const requestStatus = pgEnum('request_status', [
  'new',
  'needs_info',
  'in_progress',
  'resolved',
  'closed',
  'cancelled',
]);
export const requestSource = pgEnum('request_source', ['tenant_link', 'pm_entered']);
export const permissionToEnter = pgEnum('permission_to_enter', ['yes', 'no', 'only_if_home']);
export const workOrderStatus = pgEnum('work_order_status', [
  'draft',
  'awaiting_acceptance',
  'awaiting_quote',
  'awaiting_approval',
  'awaiting_scheduling',
  'scheduled',
  'in_progress',
  'completed',
  'closed',
  'cancelled',
]);
export const billTo = pgEnum('bill_to', ['owner', 'tenant', 'warranty']);
export const quoteStatus = pgEnum('quote_status', ['pending', 'approved', 'declined', 'superseded']);
export const approverType = pgEnum('approver_type', ['pm', 'owner', 'auto']);
export const approvalDecision = pgEnum('approval_decision', ['approved', 'declined', 'call_me']);
export const appointmentStatus = pgEnum('appointment_status', [
  'scheduled',
  'tenant_conflict',
  'no_access',
  'done',
  'cancelled',
]);
export const invoiceStatus = pgEnum('invoice_status', ['submitted', 'approved', 'rejected']);
export const actorType = pgEnum('actor_type', ['user', 'vendor', 'tenant', 'owner', 'system']);
export const visibility = pgEnum('visibility', ['internal', 'shared']);
export const attachmentKind = pgEnum('attachment_kind', ['issue_photo', 'completion_photo', 'quote', 'invoice', 'document']);
export const subjectType = pgEnum('subject_type', ['request', 'work_order', 'vendor']);

const org = () => orgId().references(() => organizations.id, { onDelete: 'cascade' });

export const maintenanceRequests = pgTable(
  'maintenance_requests',
  {
    id: id(),
    orgId: org(),
    ref: text().notNull(),
    unitId: uuid().notNull(),
    // null when the submitter couldn't be matched to a tenant record ("unverified tenant")
    tenantId: uuid(),
    categoryId: uuid().notNull(),
    title: text().notNull(),
    description: text().notNull(),
    tenantUrgency: priority(),
    priority: priority().notNull(),
    status: requestStatus().notNull().default('new'),
    statusChangedAt: tstz().notNull().defaultNow(),
    source: requestSource().notNull(),
    isEmergency: boolean().notNull().default(false),
    emergencyAckAt: tstz(),
    availabilityText: text(),
    permissionToEnter: permissionToEnter(),
    accessNotes: text(),
    pets: text(),
    submitterName: text(),
    submitterEmail: text(),
    submitterPhone: text(),
    closeReason: text(),
    infoRequest: text(),
    aiSuggestions: jsonb(),
    tenantConfirmed: text({ enum: ['fixed', 'not_fixed'] }),
    tenantRating: smallint(),
    ...timestamps,
  },
  (t) => [
    unique('requests_org_id_uq').on(t.orgId, t.id),
    uniqueIndex('requests_org_ref_uq').on(t.orgId, t.ref),
    foreignKey({ columns: [t.orgId, t.unitId], foreignColumns: [units.orgId, units.id] }),
    foreignKey({ columns: [t.orgId, t.tenantId], foreignColumns: [tenants.orgId, tenants.id] }),
    foreignKey({ columns: [t.orgId, t.categoryId], foreignColumns: [categories.orgId, categories.id] }),
    index('requests_org_status_idx').on(t.orgId, t.status, t.createdAt.desc()),
    index('requests_org_unit_idx').on(t.orgId, t.unitId, t.createdAt),
    index('requests_org_tenant_idx').on(t.orgId, t.tenantId),
    // List order, date-range reports and dashboard counts. (A trigram index can't serve ILIKE under RLS: texticlike isn't leakproof.)
    index('requests_org_created_idx').on(t.orgId, t.createdAt, t.id),
    check('requests_rating_ck', sql`${t.tenantRating} is null or ${t.tenantRating} between 1 and 5`),
  ],
);

export const workOrders = pgTable(
  'work_orders',
  {
    id: id(),
    orgId: org(),
    ref: text().notNull(),
    requestId: uuid().notNull(),
    unitId: uuid().notNull(),
    vendorId: uuid(),
    description: text().notNull(),
    requiredWork: text(),
    priority: priority().notNull(),
    status: workOrderStatus().notNull().default('draft'),
    statusChangedAt: tstz().notNull().defaultNow(),
    // Where an on-site "diagnose, then quote" job returns to once the quote is approved.
    resumeStatus: workOrderStatus(),
    expectedCompletionAt: tstz(),
    estimatedCostCents: integer(),
    quoteRequired: boolean().notNull().default(false),
    billTo: billTo().notNull().default('owner'),
    // Amount the owner/PM authorised; invoice overage is measured against it.
    approvedAmountCents: integer(),
    // Set while status = awaiting_approval: whose decision we are waiting for.
    approvalPendingWith: text({ enum: ['pm', 'owner'] }),
    cancelReason: text(),
    completionNotes: text(),
    // Milestones denormalised from the timeline so vendor/summary reports are cheap indexed queries.
    assignedAt: tstz(),
    acceptedAt: tstz(),
    completedAt: tstz(),
    closedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    unique('work_orders_org_id_uq').on(t.orgId, t.id),
    uniqueIndex('work_orders_org_ref_uq').on(t.orgId, t.ref),
    foreignKey({ columns: [t.orgId, t.requestId], foreignColumns: [maintenanceRequests.orgId, maintenanceRequests.id] }),
    foreignKey({ columns: [t.orgId, t.unitId], foreignColumns: [units.orgId, units.id] }),
    foreignKey({ columns: [t.orgId, t.vendorId], foreignColumns: [vendors.orgId, vendors.id] }),
    index('work_orders_org_status_idx').on(t.orgId, t.status, t.statusChangedAt),
    // Open jobs per firm for the superadmin console (platform_org_stats); small, open rows only.
    index('work_orders_open_org_idx').on(t.orgId).where(sql`${t.status} not in ('closed', 'cancelled')`),
    index('work_orders_org_request_idx').on(t.orgId, t.requestId),
    index('work_orders_org_vendor_idx').on(t.orgId, t.vendorId, t.createdAt),
    index('work_orders_org_unit_idx').on(t.orgId, t.unitId, t.createdAt),
    index('work_orders_org_created_idx').on(t.orgId, t.createdAt, t.id),
    check('work_orders_cost_ck', sql`${t.estimatedCostCents} is null or ${t.estimatedCostCents} >= 0`),
  ],
);

const woChild = (name: string) => (t: { orgId: PgColumn; workOrderId: PgColumn }) =>
  foreignKey({
    name: `${name}_work_order_fk`,
    columns: [t.orgId, t.workOrderId],
    foreignColumns: [workOrders.orgId, workOrders.id],
  }).onDelete('cascade');

export const quotes = pgTable(
  'quotes',
  {
    id: id(),
    orgId: orgId(),
    workOrderId: uuid().notNull(),
    vendorId: uuid(),
    amountCents: integer().notNull(),
    description: text(),
    fileKey: text(),
    version: integer().notNull(),
    status: quoteStatus().notNull().default('pending'),
    ...timestamps,
  },
  (t) => [
    unique('quotes_org_id_uq').on(t.orgId, t.id),
    woChild('quotes')(t),
    uniqueIndex('quotes_wo_version_uq').on(t.workOrderId, t.version),
    // At most one live quote per work order.
    uniqueIndex('quotes_one_pending_uq').on(t.workOrderId).where(sql`${t.status} = 'pending'`),
    index('quotes_vendor_idx').on(t.orgId, t.vendorId, t.createdAt),
    check('quotes_amount_ck', sql`${t.amountCents} >= 0`),
  ],
);

export const approvals = pgTable(
  'approvals',
  {
    id: id(),
    orgId: orgId(),
    workOrderId: uuid().notNull(),
    quoteId: uuid(),
    approverType: approverType().notNull(),
    approverId: uuid(),
    decision: approvalDecision().notNull(),
    note: text(),
    amountCents: integer().notNull(),
    channel: text({ enum: ['app', 'email_link', 'sms_link', 'phone', 'system'] }).notNull(),
    decidedAt: tstz().notNull().defaultNow(),
  },
  (t) => [woChild('approvals')(t), index('approvals_wo_idx').on(t.orgId, t.workOrderId)],
);

export const appointments = pgTable(
  'appointments',
  {
    id: id(),
    orgId: orgId(),
    workOrderId: uuid().notNull(),
    startsAt: tstz().notNull(),
    endsAt: tstz().notNull(),
    status: appointmentStatus().notNull().default('scheduled'),
    noAccessReason: text({ enum: ['tenant_no_show', 'no_permission', 'vendor_cancelled'] }),
    note: text(),
    ...timestamps,
  },
  (t) => [
    woChild('appointments')(t),
    index('appointments_wo_idx').on(t.orgId, t.workOrderId),
    index('appointments_starts_idx').on(t.startsAt).where(sql`${t.status} = 'scheduled'`),
    check('appointments_window_ck', sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

export const invoices = pgTable(
  'invoices',
  {
    id: id(),
    orgId: orgId(),
    workOrderId: uuid().notNull(),
    vendorId: uuid(),
    invoiceNumber: text(),
    amountCents: integer().notNull(),
    fileKey: text(),
    status: invoiceStatus().notNull().default('submitted'),
    approvedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    woChild('invoices')(t),
    index('invoices_wo_idx').on(t.orgId, t.workOrderId),
    check('invoices_amount_ck', sql`${t.amountCents} >= 0`),
  ],
);

export const expenses = pgTable(
  'expenses',
  {
    id: id(),
    orgId: orgId(),
    workOrderId: uuid().notNull(),
    propertyId: uuid().notNull(),
    unitId: uuid().notNull(),
    vendorId: uuid(),
    categoryId: uuid().notNull(),
    amountCents: integer().notNull(),
    billTo: billTo().notNull(),
    incurredOn: tstz().notNull(),
    exportedAt: tstz(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    woChild('expenses')(t),
    uniqueIndex('expenses_wo_uq').on(t.workOrderId),
    index('expenses_org_incurred_idx').on(t.orgId, t.incurredOn),
    index('expenses_org_property_idx').on(t.orgId, t.propertyId, t.incurredOn),
  ],
);

export const attachments = pgTable(
  'attachments',
  {
    id: id(),
    orgId: org(),
    subjectType: subjectType().notNull(),
    subjectId: uuid().notNull(),
    kind: attachmentKind().notNull(),
    fileKey: text().notNull(),
    mime: text().notNull(),
    sizeBytes: bigint({ mode: 'number' }).notNull(),
    // false until the client confirms the upload finished
    uploaded: boolean().notNull().default(false),
    uploadedByType: actorType().notNull(),
    uploadedById: uuid(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('attachments_key_uq').on(t.fileKey),
    index('attachments_subject_idx').on(t.orgId, t.subjectType, t.subjectId),
  ],
);

export const comments = pgTable(
  'comments',
  {
    id: id(),
    orgId: org(),
    subjectType: subjectType().notNull(),
    subjectId: uuid().notNull(),
    body: text().notNull(),
    visibility: visibility().notNull().default('internal'),
    authorType: actorType().notNull(),
    authorId: uuid(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [index('comments_subject_idx').on(t.orgId, t.subjectType, t.subjectId, t.createdAt)],
);

// Append-only timeline + audit log. The API role has no UPDATE/DELETE grant on this table.
export const events = pgTable(
  'events',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    orgId: org(),
    subjectType: subjectType().notNull(),
    subjectId: uuid().notNull(),
    type: text().notNull(),
    actorType: actorType().notNull(),
    actorId: uuid(),
    onBehalfOf: uuid(),
    visibility: visibility().notNull().default('shared'),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [index('events_subject_idx').on(t.orgId, t.subjectType, t.subjectId, t.id)],
);

export const deflections = pgTable(
  'deflections',
  {
    id: id(),
    orgId: org(),
    categoryId: uuid(),
    selfHelpKey: text().notNull(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [index('deflections_org_idx').on(t.orgId, t.createdAt)],
);

export const counters = pgTable(
  'counters',
  {
    orgId: org(),
    kind: text({ enum: ['MR', 'WO'] }).notNull(),
    year: integer().notNull(),
    lastValue: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.kind, t.year] })],
);
