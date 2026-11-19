-- Cross-table (org_id, id) foreign keys are checked at commit, not per statement, so deleting an
-- organization (whose ON DELETE CASCADE fans out to every table) succeeds. They still block
-- orphaning a row: deleting a unit that tenants reference fails at commit.
-- Tenants had no direct org FK, so nothing cascaded to them at all.
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ALTER CONSTRAINT "properties_org_id_owner_id_owners_org_id_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "tenants" ALTER CONSTRAINT "tenants_org_id_unit_id_units_org_id_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ALTER CONSTRAINT "maintenance_requests_org_id_unit_id_units_org_id_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ALTER CONSTRAINT "maintenance_requests_org_id_tenant_id_tenants_org_id_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ALTER CONSTRAINT "maintenance_requests_org_id_category_id_categories_org_id_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "work_orders" ALTER CONSTRAINT "work_orders_org_id_request_id_maintenance_requests_org_id_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "work_orders" ALTER CONSTRAINT "work_orders_org_id_unit_id_units_org_id_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "work_orders" ALTER CONSTRAINT "work_orders_org_id_vendor_id_vendors_org_id_id_fk" DEFERRABLE INITIALLY DEFERRED;
