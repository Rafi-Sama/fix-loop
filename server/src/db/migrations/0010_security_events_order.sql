DROP INDEX "security_events_at_idx";--> statement-breakpoint
DROP INDEX "security_events_org_idx";--> statement-breakpoint
DROP INDEX "security_events_user_idx";--> statement-breakpoint
DROP INDEX "security_events_type_idx";--> statement-breakpoint
CREATE INDEX "security_events_at_idx" ON "security_events" USING btree ("at","id");--> statement-breakpoint
CREATE INDEX "security_events_org_idx" ON "security_events" USING btree ("org_id","at","id");--> statement-breakpoint
CREATE INDEX "security_events_user_idx" ON "security_events" USING btree ("user_id","at","id");--> statement-breakpoint
CREATE INDEX "security_events_type_idx" ON "security_events" USING btree ("type","at","id");