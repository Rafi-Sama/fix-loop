DROP INDEX "security_events_at_idx";--> statement-breakpoint
DROP INDEX "security_events_org_idx";--> statement-breakpoint
DROP INDEX "security_events_user_idx";--> statement-breakpoint
DROP INDEX "security_events_type_idx";--> statement-breakpoint
CREATE INDEX "work_orders_open_org_idx" ON "work_orders" USING btree ("org_id") WHERE "work_orders"."status" not in ('closed', 'cancelled');--> statement-breakpoint
CREATE INDEX "security_events_email_trgm" ON "security_events" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "security_events_ip_trgm" ON "security_events" USING gin ("ip" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "security_events_at_idx" ON "security_events" USING btree ("at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "security_events_org_idx" ON "security_events" USING btree ("org_id","at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "security_events_user_idx" ON "security_events" USING btree ("user_id","at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "security_events_type_idx" ON "security_events" USING btree ("type","at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
-- Counts only for the firms on screen (a page of the list, or one firm), in three grouped passes,
-- instead of three correlated subqueries for every firm on the platform (650 ms with 4 firms at scale).
DROP FUNCTION platform_org_stats();--> statement-breakpoint
CREATE FUNCTION platform_org_stats(ids uuid[])
RETURNS TABLE (org_id uuid, doors bigint, open_work_orders bigint, requests_30d bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT o.id, coalesce(u.n, 0), coalesce(w.n, 0), coalesce(r.n, 0)
  FROM unnest(ids) AS o(id)
  LEFT JOIN (SELECT units.org_id, count(*) AS n FROM units WHERE units.org_id = ANY(ids) AND units.archived_at IS NULL GROUP BY 1) u ON u.org_id = o.id
  LEFT JOIN (SELECT work_orders.org_id, count(*) AS n FROM work_orders WHERE work_orders.org_id = ANY(ids) AND work_orders.status NOT IN ('closed', 'cancelled') GROUP BY 1) w ON w.org_id = o.id
  LEFT JOIN (SELECT mr.org_id, count(*) AS n FROM maintenance_requests mr WHERE mr.org_id = ANY(ids) AND mr.created_at > now() - interval '30 days' GROUP BY 1) r ON r.org_id = o.id
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION platform_org_stats(uuid[]) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION platform_org_stats(uuid[]) TO app_user;
