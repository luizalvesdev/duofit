CREATE TYPE "public"."ai_kind" AS ENUM('week_review', 'diet_review', 'workout_draft', 'diet_draft');--> statement-breakpoint
CREATE TYPE "public"."ai_status" AS ENUM('ready', 'applied', 'dismissed');--> statement-breakpoint
CREATE TABLE "ai_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "ai_kind" NOT NULL,
	"period_start" date,
	"input_hash" text NOT NULL,
	"output" jsonb NOT NULL,
	"status" "ai_status" DEFAULT 'ready' NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consent_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_profiles" ADD CONSTRAINT "ai_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_insights_user_id_kind_created_at_index" ON "ai_insights" USING btree ("user_id","kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_insights_user_id_kind_input_hash_index" ON "ai_insights" USING btree ("user_id","kind","input_hash");