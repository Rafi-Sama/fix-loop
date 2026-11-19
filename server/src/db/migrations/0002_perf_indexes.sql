DROP INDEX "requests_title_trgm";--> statement-breakpoint
CREATE INDEX "requests_org_created_idx" ON "maintenance_requests" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE INDEX "work_orders_org_created_idx" ON "work_orders" USING btree ("org_id","created_at","id");--> statement-breakpoint
-- Under row-level security Postgres only uses a filter as an index condition if its operator is
-- LEAKPROOF. Enum equality isn't marked so, which turned every `status = ...` filter into a scan of
-- the whole org (dashboard, lists, reminders). enum_eq/enum_ne only compare OIDs and can't leak or error.
-- Needs superuser; managed databases without one keep working, just with the slower plans.
DO $$
BEGIN
  ALTER FUNCTION enum_eq(anyenum, anyenum) LEAKPROOF;
  ALTER FUNCTION enum_ne(anyenum, anyenum) LEAKPROOF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'enum_eq/enum_ne not marked LEAKPROOF (needs superuser): status filters under RLS will not use indexes';
END
$$;
