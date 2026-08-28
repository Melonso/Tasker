CREATE TABLE "worker_heartbeats" (
	"service" varchar(80) PRIMARY KEY NOT NULL,
	"status" varchar(40) DEFAULT 'HEALTHY' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
