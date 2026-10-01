CREATE TYPE "public"."task_scope" AS ENUM('PRIVATE', 'COMPANY');--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "scope" "task_scope" DEFAULT 'PRIVATE' NOT NULL;--> statement-breakpoint
UPDATE "tasks"
SET "scope" = CASE
	WHEN "visibility" IN ('COMPANY', 'SHARED') THEN 'COMPANY'::"task_scope"
	ELSE 'PRIVATE'::"task_scope"
END;--> statement-breakpoint
UPDATE "task_command_drafts"
SET "payload" = jsonb_set(
	"payload",
	'{taskScope}',
	to_jsonb(CASE WHEN "payload"->>'visibility' IN ('COMPANY', 'SHARED') THEN 'COMPANY' ELSE 'PRIVATE' END),
	true
)
WHERE "payload"->>'intent' = 'CREATE_TASK' AND NOT ("payload" ? 'taskScope');--> statement-breakpoint
CREATE INDEX "tasks_scope_status_idx" ON "tasks" USING btree ("scope","status");
