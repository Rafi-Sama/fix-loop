CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."link_purpose" AS ENUM('job', 'approval', 'request_track', 'my_requests', 'vendor_profile', 'needs_info', 'confirm_fix', 'user_invite', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."link_subject_type" AS ENUM('vendor', 'tenant', 'owner', 'user');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'manager');--> statement-breakpoint
CREATE TYPE "public"."occupancy_status" AS ENUM('current', 'notice_given', 'past');--> statement-breakpoint
CREATE TYPE "public"."owner_notify_mode" AS ENUM('direct', 'pm_forwards');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('single_family', 'multi_family', 'condo', 'townhouse', 'mobile_home', 'other');--> statement-breakpoint
CREATE TYPE "public"."vendor_doc_type" AS ENUM('license', 'insurance', 'w9', 'other');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('user', 'vendor', 'tenant', 'owner', 'system');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('scheduled', 'tenant_conflict', 'no_access', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."approval_decision" AS ENUM('approved', 'declined', 'call_me');--> statement-breakpoint
CREATE TYPE "public"."approver_type" AS ENUM('pm', 'owner', 'auto');--> statement-breakpoint
CREATE TYPE "public"."attachment_kind" AS ENUM('issue_photo', 'completion_photo', 'quote', 'invoice', 'document');--> statement-breakpoint
CREATE TYPE "public"."bill_to" AS ENUM('owner', 'tenant', 'warranty');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."permission_to_enter" AS ENUM('yes', 'no', 'only_if_home');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('emergency', 'high', 'normal', 'low');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('pending', 'approved', 'declined', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."request_source" AS ENUM('tenant_link', 'pm_entered');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('new', 'needs_info', 'in_progress', 'resolved', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."subject_type" AS ENUM('request', 'work_order', 'vendor');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('internal', 'shared');--> statement-breakpoint
CREATE TYPE "public"."work_order_status" AS ENUM('draft', 'awaiting_acceptance', 'awaiting_quote', 'awaiting_approval', 'awaiting_scheduling', 'scheduled', 'in_progress', 'completed', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('email', 'sms');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."recipient_type" AS ENUM('user', 'vendor', 'tenant', 'owner');--> statement-breakpoint
CREATE TABLE "access_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"subject_type" "link_subject_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"purpose" "link_purpose" NOT NULL,
	"scope_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"phone" text,
	"emergency_phone" text,
	"address" text,
	"logo_key" text,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"default_approval_threshold_cents" integer DEFAULT 30000 NOT NULL,
	"auto_approve_under_threshold" boolean DEFAULT false NOT NULL,
	"emergency_spend_limit_cents" integer DEFAULT 50000 NOT NULL,
	"invoice_overage_pct" integer DEFAULT 10 NOT NULL,
	"sla_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reminder_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"emergency_keywords" text[] DEFAULT ARRAY['gas','smell gas','flood','flooding','sparks','smoke','fire','no heat','carbon monoxide','sewage']::text[] NOT NULL,
	"sms_registration_status" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"ip" text,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"role" "user_role" DEFAULT 'manager' NOT NULL,
	"password_hash" text,
	"active" boolean DEFAULT true NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"notification_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"photo_required" boolean DEFAULT false NOT NULL,
	"self_help_key" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_org_id_uq" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"approval_threshold_cents" integer,
	"notify_mode" "owner_notify_mode" DEFAULT 'direct' NOT NULL,
	"send_completion_summary" boolean DEFAULT false NOT NULL,
	"external_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owners_org_id_uq" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"name_ref" text NOT NULL,
	"address_line" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip" text NOT NULL,
	"type" "property_type" NOT NULL,
	"notes" text,
	"emergency_phone" text,
	"external_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_org_id_uq" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"occupancy_status" "occupancy_status" DEFAULT 'current' NOT NULL,
	"sms_consent_at" timestamp with time zone,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_org_id_uq" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"label" text NOT NULL,
	"notes" text,
	"external_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "units_org_id_uq" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "vendor_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"type" "vendor_doc_type" NOT NULL,
	"label" text,
	"file_key" text NOT NULL,
	"expires_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"address" text,
	"category_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"coverage_zips" text[] DEFAULT '{}'::text[] NOT NULL,
	"coverage_cities" text[] DEFAULT '{}'::text[] NOT NULL,
	"availability_text" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"sms_consent_at" timestamp with time zone,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_org_id_uq" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "appointment_status" DEFAULT 'scheduled' NOT NULL,
	"no_access_reason" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_window_ck" CHECK ("appointments"."ends_at" > "appointments"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"quote_id" uuid,
	"approver_type" "approver_type" NOT NULL,
	"approver_id" uuid,
	"decision" "approval_decision" NOT NULL,
	"note" text,
	"amount_cents" integer NOT NULL,
	"channel" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"kind" "attachment_kind" NOT NULL,
	"file_key" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"uploaded" boolean DEFAULT false NOT NULL,
	"uploaded_by_type" "actor_type" NOT NULL,
	"uploaded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"body" text NOT NULL,
	"visibility" "visibility" DEFAULT 'internal' NOT NULL,
	"author_type" "actor_type" NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"year" integer NOT NULL,
	"last_value" integer NOT NULL,
	CONSTRAINT "counters_org_id_kind_year_pk" PRIMARY KEY("org_id","kind","year")
);
--> statement-breakpoint
CREATE TABLE "deflections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"category_id" uuid,
	"self_help_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" uuid NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"on_behalf_of" uuid,
	"visibility" "visibility" DEFAULT 'shared' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"vendor_id" uuid,
	"category_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"bill_to" "bill_to" NOT NULL,
	"incurred_on" timestamp with time zone NOT NULL,
	"exported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"vendor_id" uuid,
	"invoice_number" text,
	"amount_cents" integer NOT NULL,
	"file_key" text,
	"status" "invoice_status" DEFAULT 'submitted' NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_amount_ck" CHECK ("invoices"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "maintenance_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"ref" text NOT NULL,
	"unit_id" uuid NOT NULL,
	"tenant_id" uuid,
	"category_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"tenant_urgency" "priority",
	"priority" "priority" NOT NULL,
	"status" "request_status" DEFAULT 'new' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "request_source" NOT NULL,
	"is_emergency" boolean DEFAULT false NOT NULL,
	"emergency_ack_at" timestamp with time zone,
	"availability_text" text,
	"permission_to_enter" "permission_to_enter",
	"access_notes" text,
	"pets" text,
	"submitter_name" text,
	"submitter_email" text,
	"submitter_phone" text,
	"close_reason" text,
	"info_request" text,
	"ai_suggestions" jsonb,
	"tenant_confirmed" text,
	"tenant_rating" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requests_org_id_uq" UNIQUE("org_id","id"),
	CONSTRAINT "requests_rating_ck" CHECK ("maintenance_requests"."tenant_rating" is null or "maintenance_requests"."tenant_rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"vendor_id" uuid,
	"amount_cents" integer NOT NULL,
	"description" text,
	"file_key" text,
	"version" integer NOT NULL,
	"status" "quote_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_org_id_uq" UNIQUE("org_id","id"),
	CONSTRAINT "quotes_amount_ck" CHECK ("quotes"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"ref" text NOT NULL,
	"request_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"vendor_id" uuid,
	"description" text NOT NULL,
	"required_work" text,
	"priority" "priority" NOT NULL,
	"status" "work_order_status" DEFAULT 'draft' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resume_status" "work_order_status",
	"expected_completion_at" timestamp with time zone,
	"estimated_cost_cents" integer,
	"quote_required" boolean DEFAULT false NOT NULL,
	"bill_to" "bill_to" DEFAULT 'owner' NOT NULL,
	"approved_amount_cents" integer,
	"approval_pending_with" text,
	"cancel_reason" text,
	"completion_notes" text,
	"assigned_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_orders_org_id_uq" UNIQUE("org_id","id"),
	CONSTRAINT "work_orders_cost_ck" CHECK ("work_orders"."estimated_cost_cents" is null or "work_orders"."estimated_cost_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"channel" "channel" NOT NULL,
	"recipient_type" "recipient_type" NOT NULL,
	"recipient_id" uuid NOT NULL,
	"to_address" text NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"status" "notification_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"provider_id" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"expected_status" text,
	"due_at" timestamp with time zone NOT NULL,
	"fired_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_links" ADD CONSTRAINT "access_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owners" ADD CONSTRAINT "owners_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_org_id_owner_id_owners_org_id_id_fk" FOREIGN KEY ("org_id","owner_id") REFERENCES "public"."owners"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_org_id_unit_id_units_org_id_id_fk" FOREIGN KEY ("org_id","unit_id") REFERENCES "public"."units"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_org_id_property_id_properties_org_id_id_fk" FOREIGN KEY ("org_id","property_id") REFERENCES "public"."properties"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_documents" ADD CONSTRAINT "vendor_documents_org_id_vendor_id_vendors_org_id_id_fk" FOREIGN KEY ("org_id","vendor_id") REFERENCES "public"."vendors"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_work_order_fk" FOREIGN KEY ("org_id","work_order_id") REFERENCES "public"."work_orders"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_work_order_fk" FOREIGN KEY ("org_id","work_order_id") REFERENCES "public"."work_orders"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counters" ADD CONSTRAINT "counters_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deflections" ADD CONSTRAINT "deflections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_work_order_fk" FOREIGN KEY ("org_id","work_order_id") REFERENCES "public"."work_orders"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_work_order_fk" FOREIGN KEY ("org_id","work_order_id") REFERENCES "public"."work_orders"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_org_id_unit_id_units_org_id_id_fk" FOREIGN KEY ("org_id","unit_id") REFERENCES "public"."units"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_org_id_tenant_id_tenants_org_id_id_fk" FOREIGN KEY ("org_id","tenant_id") REFERENCES "public"."tenants"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_org_id_category_id_categories_org_id_id_fk" FOREIGN KEY ("org_id","category_id") REFERENCES "public"."categories"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_work_order_fk" FOREIGN KEY ("org_id","work_order_id") REFERENCES "public"."work_orders"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_org_id_request_id_maintenance_requests_org_id_id_fk" FOREIGN KEY ("org_id","request_id") REFERENCES "public"."maintenance_requests"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_org_id_unit_id_units_org_id_id_fk" FOREIGN KEY ("org_id","unit_id") REFERENCES "public"."units"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_org_id_vendor_id_vendors_org_id_id_fk" FOREIGN KEY ("org_id","vendor_id") REFERENCES "public"."vendors"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_links_token_uq" ON "access_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "access_links_scope_idx" ON "access_links" USING btree ("org_id","scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_uq" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_org_name_uq" ON "categories" USING btree ("org_id",lower("name"));--> statement-breakpoint
CREATE INDEX "owners_org_name_idx" ON "owners" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "properties_org_owner_idx" ON "properties" USING btree ("org_id","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "properties_org_external_uq" ON "properties" USING btree ("org_id","external_id") WHERE "properties"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "tenants_org_unit_idx" ON "tenants" USING btree ("org_id","unit_id");--> statement-breakpoint
CREATE INDEX "tenants_org_email_idx" ON "tenants" USING btree ("org_id",lower("email"));--> statement-breakpoint
CREATE INDEX "tenants_org_phone_idx" ON "tenants" USING btree ("org_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "units_property_label_uq" ON "units" USING btree ("property_id",lower("label"));--> statement-breakpoint
CREATE INDEX "vendor_documents_vendor_idx" ON "vendor_documents" USING btree ("org_id","vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_documents_expiry_idx" ON "vendor_documents" USING btree ("expires_on");--> statement-breakpoint
CREATE INDEX "vendors_org_active_idx" ON "vendors" USING btree ("org_id","active");--> statement-breakpoint
CREATE INDEX "vendors_categories_gin" ON "vendors" USING gin ("category_ids");--> statement-breakpoint
CREATE INDEX "appointments_wo_idx" ON "appointments" USING btree ("org_id","work_order_id");--> statement-breakpoint
CREATE INDEX "appointments_starts_idx" ON "appointments" USING btree ("starts_at") WHERE "appointments"."status" = 'scheduled';--> statement-breakpoint
CREATE INDEX "approvals_wo_idx" ON "approvals" USING btree ("org_id","work_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_key_uq" ON "attachments" USING btree ("file_key");--> statement-breakpoint
CREATE INDEX "attachments_subject_idx" ON "attachments" USING btree ("org_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "comments_subject_idx" ON "comments" USING btree ("org_id","subject_type","subject_id","created_at");--> statement-breakpoint
CREATE INDEX "deflections_org_idx" ON "deflections" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "events_subject_idx" ON "events" USING btree ("org_id","subject_type","subject_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_wo_uq" ON "expenses" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "expenses_org_incurred_idx" ON "expenses" USING btree ("org_id","incurred_on");--> statement-breakpoint
CREATE INDEX "invoices_wo_idx" ON "invoices" USING btree ("org_id","work_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requests_org_ref_uq" ON "maintenance_requests" USING btree ("org_id","ref");--> statement-breakpoint
CREATE INDEX "requests_org_status_idx" ON "maintenance_requests" USING btree ("org_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "requests_org_unit_idx" ON "maintenance_requests" USING btree ("org_id","unit_id");--> statement-breakpoint
CREATE INDEX "requests_org_tenant_idx" ON "maintenance_requests" USING btree ("org_id","tenant_id");--> statement-breakpoint
CREATE INDEX "requests_title_trgm" ON "maintenance_requests" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_wo_version_uq" ON "quotes" USING btree ("work_order_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_one_pending_uq" ON "quotes" USING btree ("work_order_id") WHERE "quotes"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "work_orders_org_ref_uq" ON "work_orders" USING btree ("org_id","ref");--> statement-breakpoint
CREATE INDEX "work_orders_org_status_idx" ON "work_orders" USING btree ("org_id","status","status_changed_at");--> statement-breakpoint
CREATE INDEX "work_orders_org_request_idx" ON "work_orders" USING btree ("org_id","request_id");--> statement-breakpoint
CREATE INDEX "work_orders_org_vendor_idx" ON "work_orders" USING btree ("org_id","vendor_id");--> statement-breakpoint
CREATE INDEX "notifications_due_idx" ON "notifications" USING btree ("next_attempt_at") WHERE "notifications"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "notifications_subject_idx" ON "notifications" USING btree ("org_id","subject_type","subject_id","created_at");--> statement-breakpoint
CREATE INDEX "reminders_due_idx" ON "reminders" USING btree ("due_at") WHERE "reminders"."fired_at" is null and "reminders"."cancelled_at" is null;--> statement-breakpoint
CREATE INDEX "reminders_subject_idx" ON "reminders" USING btree ("org_id","subject_id") WHERE "reminders"."fired_at" is null and "reminders"."cancelled_at" is null;