-- Row-level security: every tenant-domain table is visible only for the org set in the
-- transaction-local setting `app.org_id`. Unset → no rows (fails closed).
-- The table owner (migrations, worker) is not subject to RLS; the API role app_user is.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    -- Ops must enable login: ALTER ROLE app_user LOGIN PASSWORD '...';
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_user;
--> statement-breakpoint
DO $$
DECLARE
  t text;
  rls_tables text[] := ARRAY[
    'owners','properties','units','tenants','categories','vendors','vendor_documents',
    'maintenance_requests','work_orders','quotes','approvals','appointments','invoices','expenses',
    'attachments','comments','events','deflections','counters','notifications','reminders'
  ];
  -- Looked up before an org context exists; scoped in application code.
  plain_tables text[] := ARRAY['organizations','users','sessions','access_links'];
BEGIN
  FOREACH t IN ARRAY rls_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY org_isolation ON %I USING (org_id = nullif(current_setting(''app.org_id'', true), '''')::uuid) '
      'WITH CHECK (org_id = nullif(current_setting(''app.org_id'', true), '''')::uuid)', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
  END LOOP;
  FOREACH t IN ARRAY plain_tables LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
  END LOOP;
END
$$;
--> statement-breakpoint
-- The timeline is an audit log: the API may only append to it.
REVOKE UPDATE, DELETE ON events FROM app_user;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
