ALTER TABLE "tasks" ADD COLUMN "planned_for_date" date;--> statement-breakpoint
CREATE INDEX "tasks_assignee_planned_date_idx" ON "tasks" USING btree ("assignee_id","planned_for_date");