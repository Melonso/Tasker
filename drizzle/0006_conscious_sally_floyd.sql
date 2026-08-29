CREATE TABLE "notification_preferences" (
	"user_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_channel_pk" PRIMARY KEY("user_id","channel")
);
--> statement-breakpoint
CREATE TABLE "pilot_participants" (
	"pilot_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pilot_participants_pilot_id_user_id_pk" PRIMARY KEY("pilot_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "pilot_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_recurrences" ADD COLUMN "series_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "task_recurrences" ADD COLUMN "is_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "created_by_id" uuid;--> statement-breakpoint
UPDATE "teams"
SET "created_by_id" = (
	SELECT "users"."id"
	FROM "users"
	INNER JOIN "user_roles" ON "user_roles"."user_id" = "users"."id"
	INNER JOIN "roles" ON "roles"."id" = "user_roles"."role_id"
	WHERE "roles"."key" = 'BUSINESS_OWNER'
	ORDER BY "users"."created_at"
	LIMIT 1
)
WHERE "created_by_id" IS NULL;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "teams" WHERE "created_by_id" IS NULL) THEN
		RAISE EXCEPTION 'Cannot assign an owner to existing teams.';
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "created_by_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_participants" ADD CONSTRAINT "pilot_participants_pilot_id_pilot_programs_id_fk" FOREIGN KEY ("pilot_id") REFERENCES "public"."pilot_programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_participants" ADD CONSTRAINT "pilot_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilot_programs" ADD CONSTRAINT "pilot_programs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DELETE FROM "task_shares" current_share
USING "task_shares" duplicate_share
WHERE current_share."id" > duplicate_share."id"
	AND current_share."task_id" = duplicate_share."task_id"
	AND current_share."user_id" IS NOT DISTINCT FROM duplicate_share."user_id"
	AND current_share."team_id" IS NOT DISTINCT FROM duplicate_share."team_id";--> statement-breakpoint
CREATE UNIQUE INDEX "task_shares_task_user_unique" ON "task_shares" USING btree ("task_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_shares_task_team_unique" ON "task_shares" USING btree ("task_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_creator_name_unique" ON "teams" USING btree ("created_by_id","name");
