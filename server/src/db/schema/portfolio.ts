import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, orgId, timestamps, tstz } from './_shared.js';
import { organizations } from './identity.js';

export const propertyType = pgEnum('property_type', [
  'single_family',
  'multi_family',
  'condo',
  'townhouse',
  'mobile_home',
  'other',
]);
export const occupancyStatus = pgEnum('occupancy_status', ['current', 'notice_given', 'past']);
export const vendorDocType = pgEnum('vendor_doc_type', ['license', 'insurance', 'w9', 'other']);
export const ownerNotifyMode = pgEnum('owner_notify_mode', ['direct', 'pm_forwards']);

const org = () =>
  orgId().references(() => organizations.id, { onDelete: 'cascade' });

export const owners = pgTable(
  'owners',
  {
    id: id(),
    orgId: org(),
    name: text().notNull(),
    email: text(),
    phone: text(),
    // null → organization default
    approvalThresholdCents: integer(),
    notifyMode: ownerNotifyMode().notNull().default('direct'),
    sendCompletionSummary: boolean().notNull().default(false),
    externalId: text(),
    archivedAt: tstz(),
    ...timestamps,
  },
  (t) => [unique('owners_org_id_uq').on(t.orgId, t.id), index('owners_org_name_idx').on(t.orgId, t.name)],
);

export const properties = pgTable(
  'properties',
  {
    id: id(),
    orgId: org(),
    ownerId: uuid().notNull(),
    nameRef: text().notNull(),
    addressLine: text().notNull(),
    city: text().notNull(),
    state: text().notNull(),
    zip: text().notNull(),
    type: propertyType().notNull(),
    notes: text(),
    emergencyPhone: text(),
    externalId: text(),
    archivedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    unique('properties_org_id_uq').on(t.orgId, t.id),
    foreignKey({ columns: [t.orgId, t.ownerId], foreignColumns: [owners.orgId, owners.id] }),
    index('properties_org_owner_idx').on(t.orgId, t.ownerId),
    uniqueIndex('properties_org_external_uq').on(t.orgId, t.externalId).where(sql`${t.externalId} is not null`),
  ],
);

export const units = pgTable(
  'units',
  {
    id: id(),
    orgId: orgId(),
    propertyId: uuid().notNull(),
    label: text().notNull(),
    notes: text(),
    externalId: text(),
    archivedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    unique('units_org_id_uq').on(t.orgId, t.id),
    foreignKey({ columns: [t.orgId, t.propertyId], foreignColumns: [properties.orgId, properties.id] }).onDelete(
      'cascade',
    ),
    uniqueIndex('units_property_label_uq').on(t.propertyId, sql`lower(${t.label})`),
  ],
);

export const tenants = pgTable(
  'tenants',
  {
    id: id(),
    // Tenants reach the org only through units → properties otherwise, which no cascade follows.
    orgId: org(),
    unitId: uuid().notNull(),
    name: text().notNull(),
    email: text(),
    // E.164
    phone: text(),
    occupancyStatus: occupancyStatus().notNull().default('current'),
    smsConsentAt: tstz(),
    externalId: text(),
    ...timestamps,
  },
  (t) => [
    unique('tenants_org_id_uq').on(t.orgId, t.id),
    foreignKey({ columns: [t.orgId, t.unitId], foreignColumns: [units.orgId, units.id] }),
    index('tenants_org_unit_idx').on(t.orgId, t.unitId),
    index('tenants_org_email_idx').on(t.orgId, sql`lower(${t.email})`),
    index('tenants_org_phone_idx').on(t.orgId, t.phone),
  ],
);

export const categories = pgTable(
  'categories',
  {
    id: id(),
    orgId: org(),
    name: text().notNull(),
    active: boolean().notNull().default(true),
    photoRequired: boolean().notNull().default(false),
    selfHelpKey: text(),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    unique('categories_org_id_uq').on(t.orgId, t.id),
    uniqueIndex('categories_org_name_uq').on(t.orgId, sql`lower(${t.name})`),
  ],
);

export const vendors = pgTable(
  'vendors',
  {
    id: id(),
    orgId: org(),
    companyName: text().notNull(),
    contactName: text(),
    email: text(),
    phone: text(),
    address: text(),
    categoryIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    coverageZips: text().array().notNull().default(sql`'{}'::text[]`),
    coverageCities: text().array().notNull().default(sql`'{}'::text[]`),
    availabilityText: text(),
    notes: text(),
    active: boolean().notNull().default(true),
    smsConsentAt: tstz(),
    externalId: text(),
    ...timestamps,
  },
  (t) => [
    unique('vendors_org_id_uq').on(t.orgId, t.id),
    index('vendors_org_active_idx').on(t.orgId, t.active),
    index('vendors_categories_gin').using('gin', t.categoryIds),
  ],
);

export const vendorDocuments = pgTable(
  'vendor_documents',
  {
    id: id(),
    orgId: orgId(),
    vendorId: uuid().notNull(),
    type: vendorDocType().notNull(),
    label: text(),
    fileKey: text().notNull(),
    expiresOn: date({ mode: 'string' }),
    ...timestamps,
  },
  (t) => [
    foreignKey({ columns: [t.orgId, t.vendorId], foreignColumns: [vendors.orgId, vendors.id] }).onDelete('cascade'),
    index('vendor_documents_vendor_idx').on(t.orgId, t.vendorId),
    index('vendor_documents_expiry_idx').on(t.expiresOn),
  ],
);
