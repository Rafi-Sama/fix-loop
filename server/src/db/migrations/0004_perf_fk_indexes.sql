DROP INDEX "requests_org_unit_idx";--> statement-breakpoint
DROP INDEX "work_orders_org_vendor_idx";--> statement-breakpoint
CREATE INDEX "expenses_org_property_idx" ON "expenses" USING btree ("org_id","property_id","incurred_on");--> statement-breakpoint
CREATE INDEX "quotes_vendor_idx" ON "quotes" USING btree ("org_id","vendor_id","created_at");--> statement-breakpoint
CREATE INDEX "work_orders_org_unit_idx" ON "work_orders" USING btree ("org_id","unit_id","created_at");--> statement-breakpoint
CREATE INDEX "requests_org_unit_idx" ON "maintenance_requests" USING btree ("org_id","unit_id","created_at");--> statement-breakpoint
CREATE INDEX "work_orders_org_vendor_idx" ON "work_orders" USING btree ("org_id","vendor_id","created_at");