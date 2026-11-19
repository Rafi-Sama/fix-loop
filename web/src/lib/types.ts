/** Response shapes of the Fastify API, as the UI uses them. Dates arrive as ISO strings. */
import type { Compliance, Occupancy, Party, Priority, PropertyType, RequestStatus, WoStatus } from './format';

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Me {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: 'admin' | 'manager';
  emailVerified: boolean;
  org: { id: string; name: string; slug: string; timezone: string };
}

export interface Sla {
  assignHours: number;
  completeHours: number;
}

export interface OrgSettings {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  emergencyPhone: string | null;
  address: string | null;
  timezone: string;
  defaultApprovalThresholdCents: number;
  autoApproveUnderThreshold: boolean;
  emergencySpendLimitCents: number;
  invoiceOveragePct: number;
  slaConfig: Partial<Record<Priority, Sla>>;
  reminderConfig: Record<string, number>;
  emergencyKeywords: string[];
  smsRegistrationStatus: 'none' | 'pending' | 'approved' | 'rejected';
}

export interface Category {
  id: string;
  name: string;
  active: boolean;
  photoRequired: boolean;
  sortOrder: number;
  selfHelpKey: string | null;
}

export interface TeamUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: 'admin' | 'manager';
  active: boolean;
  invited: boolean;
}

export interface Session {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export interface Owner {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  approvalThresholdCents: number | null;
  notifyMode: 'direct' | 'pm_forwards';
  sendCompletionSummary: boolean;
  externalId: string | null;
  createdAt: string;
}

export interface PropertyRow {
  id: string;
  nameRef: string;
  addressLine: string;
  city: string;
  state: string;
  zip: string;
  type: PropertyType;
  ownerId: string;
  ownerName: string;
  archivedAt: string | null;
  createdAt: string;
  unitCount: number;
}

export interface Unit {
  id: string;
  propertyId: string;
  label: string;
  notes: string | null;
  archivedAt: string | null;
}

export interface Property {
  id: string;
  nameRef: string;
  addressLine: string;
  city: string;
  state: string;
  zip: string;
  type: PropertyType;
  notes: string | null;
  emergencyPhone: string | null;
  externalId: string | null;
  ownerId: string;
  archivedAt: string | null;
  createdAt: string;
}

export interface PropertyDetail extends Property {
  owner: Owner;
  units: Unit[];
  tenants: { id: string; name: string; email: string | null; phone: string | null; unitId: string; occupancyStatus: Occupancy }[];
  openRequests: { id: string; ref: string; title: string; status: RequestStatus; priority: Priority; createdAt: string }[];
  completedJobs: { id: string; ref: string; description: string; closedAt: string | null }[];
  expenseByMonth: { month: string; totalCents: number }[];
}

export interface TenantRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  occupancyStatus: Occupancy;
  unitId: string;
  unitLabel: string;
  propertyId: string;
  propertyName: string;
  createdAt: string;
}

export interface Tenant {
  id: string;
  unitId: string;
  name: string;
  email: string | null;
  phone: string | null;
  occupancyStatus: Occupancy;
  smsConsentAt: string | null;
  externalId: string | null;
  createdAt: string;
}

export interface TenantDetail extends Tenant {
  requests: { id: string; ref: string; title: string; status: RequestStatus; createdAt: string }[];
}

export interface Vendor {
  id: string;
  companyName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  categoryIds: string[];
  coverageZips: string[];
  coverageCities: string[];
  availabilityText: string | null;
  notes: string | null;
  active: boolean;
  smsConsentAt: string | null;
  externalId: string | null;
  createdAt: string;
  compliance?: Compliance;
}

export interface VendorDocument {
  id: string;
  vendorId: string;
  type: 'license' | 'insurance' | 'w9' | 'other';
  label: string | null;
  fileKey: string;
  expiresOn: string | null;
  createdAt: string;
}

export interface VendorDetail extends Vendor {
  compliance: Compliance;
  documents: VendorDocument[];
  assignedWorkOrders: { id: string; ref: string; status: WoStatus; description: string; priority: Priority; createdAt: string }[];
  quoteHistory: { id: string; workOrderId: string; amountCents: number; status: QuoteStatus; version: number; createdAt: string }[];
  responseTimes: { medianAcceptHours: number | null; medianCompleteHours: number | null } | undefined;
}

export interface RequestRow {
  id: string;
  ref: string;
  title: string;
  status: RequestStatus;
  priority: Priority;
  isEmergency: boolean;
  source: 'tenant_link' | 'pm_entered';
  createdAt: string;
  statusChangedAt: string;
  unitId: string;
  unitLabel: string;
  propertyId: string;
  address: string;
  tenantName: string | null;
  verifiedTenant: boolean;
}

export interface Attachment {
  id: string;
  kind: 'issue_photo' | 'completion_photo' | 'quote' | 'invoice' | 'document';
  mime: string;
  sizeBytes: number;
  createdAt: string;
  uploadedByType?: string;
  /** Short-lived signed download URL. */
  url?: string;
}

export interface TimelineEvent {
  id: string | number;
  type: string;
  actorType: 'user' | 'vendor' | 'tenant' | 'owner' | 'system';
  actorId: string | null;
  onBehalfOf: string | null;
  visibility: 'internal' | 'shared';
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface Comment {
  id: string;
  body: string;
  visibility: 'internal' | 'shared';
  authorType: TimelineEvent['actorType'];
  authorId: string | null;
  createdAt: string;
}

export interface RequestDetail {
  id: string;
  ref: string;
  title: string;
  description: string;
  categoryId: string;
  tenantUrgency: Priority | null;
  priority: Priority;
  status: RequestStatus;
  statusChangedAt: string;
  source: 'tenant_link' | 'pm_entered';
  isEmergency: boolean;
  emergencyAckAt: string | null;
  availabilityText: string | null;
  permissionToEnter: 'yes' | 'no' | 'only_if_home' | null;
  accessNotes: string | null;
  pets: string | null;
  submitterName: string | null;
  submitterEmail: string | null;
  submitterPhone: string | null;
  closeReason: string | null;
  infoRequest: string | null;
  tenantConfirmed: 'fixed' | 'not_fixed' | null;
  tenantRating: number | null;
  createdAt: string;
  unit: Unit;
  property: Property;
  tenant: Tenant | null;
  workOrders: { id: string; ref: string; status: WoStatus; vendorId: string | null }[];
  attachments: Attachment[];
  timeline: TimelineEvent[];
  comments: Comment[];
}

export interface WoRow {
  id: string;
  ref: string;
  status: WoStatus;
  priority: Priority;
  description: string;
  approvalPendingWith: 'pm' | 'owner' | null;
  statusChangedAt: string;
  expectedCompletionAt: string | null;
  createdAt: string;
  requestRef: string;
  address: string;
  unitLabel: string;
  vendorName: string | null;
  waitingOn: Party | null;
}

export type QuoteStatus = 'pending' | 'approved' | 'declined' | 'superseded';

export interface Quote {
  id: string;
  amountCents: number;
  description: string | null;
  fileKey: string | null;
  version: number;
  status: QuoteStatus;
  createdAt: string;
}

export interface Approval {
  id: string;
  quoteId: string | null;
  approverType: 'pm' | 'owner' | 'auto';
  decision: 'approved' | 'declined' | 'call_me';
  note: string | null;
  amountCents: number;
  channel: string;
  decidedAt: string;
}

export interface Appointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: 'scheduled' | 'tenant_conflict' | 'no_access' | 'done' | 'cancelled';
  noAccessReason: string | null;
  note: string | null;
  createdAt: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string | null;
  amountCents: number;
  fileKey: string | null;
  status: 'submitted' | 'approved' | 'rejected';
  approvedAt: string | null;
  createdAt: string;
}

export interface Communication {
  id: string;
  channel: 'email' | 'sms';
  recipientType: string;
  recipientId: string | null;
  template: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
}

export interface WoDetail {
  id: string;
  ref: string;
  requestId: string;
  unitId: string;
  vendorId: string | null;
  description: string;
  requiredWork: string | null;
  priority: Priority;
  status: WoStatus;
  statusChangedAt: string;
  resumeStatus: WoStatus | null;
  expectedCompletionAt: string | null;
  estimatedCostCents: number | null;
  quoteRequired: boolean;
  billTo: 'owner' | 'tenant' | 'warranty';
  approvedAmountCents: number | null;
  approvalPendingWith: 'pm' | 'owner' | null;
  cancelReason: string | null;
  completionNotes: string | null;
  assignedAt: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  waitingOn: Party | null;
  request: Omit<RequestDetail, 'unit' | 'property' | 'tenant' | 'workOrders' | 'attachments' | 'timeline' | 'comments'>;
  unit: Unit;
  property: Property;
  owner: Owner;
  vendor: Vendor | null;
  tenant: { id: string; name: string; phone: string | null; email: string | null } | null;
  quotes: Quote[];
  approvals: Approval[];
  appointments: Appointment[];
  invoices: Invoice[];
  attachments: Attachment[];
  timeline: TimelineEvent[];
  comments: Comment[];
  communications: Communication[];
}

export interface QueueItem {
  id: string;
  ref: string;
  status: WoStatus;
  priority: Priority;
  description: string;
  approvalPendingWith: 'pm' | 'owner' | null;
  statusChangedAt: string;
  expectedCompletionAt: string | null;
  address: string;
  unitLabel: string;
  vendorName: string | null;
  waitingOn: Party | null;
  waitedHours: number;
  atRisk: boolean;
}

export interface Dashboard {
  tiles: {
    totalProperties: number;
    totalRequests: number;
    openRequests: number;
    awaitingAcceptance: number;
    inProgress: number;
    awaitingApproval: number;
    awaitingReview: number;
    closedThisPeriod: number;
    overdue: number;
  };
  queue: {
    atRisk: QueueItem[];
    you: QueueItem[];
    vendor: QueueItem[];
    owner: QueueItem[];
    tenant: { id: string; ref: string; title: string; statusChangedAt: string; waitedHours: number }[];
  };
}
