ALTER TABLE "security_events" ALTER COLUMN "at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "security_events" ALTER COLUMN "at" SET DEFAULT now();