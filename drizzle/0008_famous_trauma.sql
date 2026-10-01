CREATE TYPE "public"."note_color" AS ENUM('NEUTRAL', 'YELLOW', 'GREEN', 'BLUE', 'PINK', 'PURPLE');--> statement-breakpoint
CREATE TYPE "public"."note_reminder_frequency" AS ENUM('DAILY', 'WEEKLY');--> statement-breakpoint
CREATE TABLE "note_reminder_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"frequency" "note_reminder_frequency" NOT NULL,
	"weekday" integer,
	"hour" integer NOT NULL,
	"minute" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_reminder_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text NOT NULL,
	"color" "note_color" DEFAULT 'NEUTRAL' NOT NULL,
	"source_event_id" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_source_event_id_unique" UNIQUE("source_event_id")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "target_path" varchar(500);--> statement-breakpoint
ALTER TABLE "note_reminder_schedules" ADD CONSTRAINT "note_reminder_schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_reminder_schedules_due_idx" ON "note_reminder_schedules" USING btree ("enabled","next_reminder_at");--> statement-breakpoint
CREATE INDEX "note_reminder_schedules_user_idx" ON "note_reminder_schedules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notes_user_updated_idx" ON "notes" USING btree ("user_id","updated_at");