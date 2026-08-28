CREATE TYPE "public"."command_draft_status" AS ENUM('DRAFT', 'NEEDS_CLARIFICATION', 'CONFIRMED', 'CANCELED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "task_command_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" varchar(40) DEFAULT 'TELEGRAM' NOT NULL,
	"source_event_id" varchar(200) NOT NULL,
	"status" "command_draft_status" DEFAULT 'DRAFT' NOT NULL,
	"payload" jsonb NOT NULL,
	"task_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_link_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_command_drafts" ADD CONSTRAINT "task_command_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_command_drafts" ADD CONSTRAINT "task_command_drafts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_command_drafts_source_event_unique" ON "task_command_drafts" USING btree ("source","source_event_id");--> statement-breakpoint
CREATE INDEX "task_command_drafts_user_status_idx" ON "task_command_drafts" USING btree ("user_id","status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_link_codes_hash_unique" ON "telegram_link_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "telegram_link_codes_user_idx" ON "telegram_link_codes" USING btree ("user_id","created_at");