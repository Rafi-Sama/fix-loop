ALTER TYPE "public"."link_purpose" ADD VALUE 'email_verify';--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"totp_secret" text NOT NULL,
	"totp_last_step" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"org_id" uuid,
	"user_id" uuid,
	"platform_admin_id" uuid,
	"email" text,
	"ip" text,
	"user_agent" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_sessions" ADD CONSTRAINT "platform_sessions_admin_id_platform_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."platform_admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_admins_email_uq" ON "platform_admins" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "platform_sessions_token_uq" ON "platform_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "platform_sessions_admin_idx" ON "platform_sessions" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "security_events_at_idx" ON "security_events" USING btree ("at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "security_events_org_idx" ON "security_events" USING btree ("org_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "security_events_user_idx" ON "security_events" USING btree ("user_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "security_events_type_idx" ON "security_events" USING btree ("type","at" DESC NULLS LAST);--> statement-breakpoint
-- Everyone who already has a password signed up or accepted an invite before verification existed.
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "password_hash" IS NOT NULL;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_admins", "platform_sessions" TO app_user;--> statement-breakpoint
-- Tamper-resistant: the API can append and read the security log, never edit or delete it (the worker prunes it).
GRANT SELECT, INSERT ON "security_events" TO app_user;--> statement-breakpoint
-- Per-firm counts for the superadmin console. Runs as the table owner (not subject to RLS) and returns
-- numbers only, never rows, so the API still can't read one firm's records outside its org context.
CREATE FUNCTION platform_org_stats()
RETURNS TABLE (org_id uuid, doors bigint, open_work_orders bigint, requests_30d bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id,
    (SELECT count(*) FROM units u WHERE u.org_id = o.id AND u.archived_at IS NULL),
    (SELECT count(*) FROM work_orders w WHERE w.org_id = o.id AND w.status NOT IN ('closed', 'cancelled')),
    (SELECT count(*) FROM maintenance_requests r WHERE r.org_id = o.id AND r.created_at > now() - interval '30 days')
  FROM organizations o
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION platform_org_stats() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION platform_org_stats() TO app_user;
