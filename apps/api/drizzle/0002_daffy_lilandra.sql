CREATE TYPE "public"."equipment" AS ENUM('barbell', 'dumbbell', 'machine', 'smith', 'cable', 'ez_bar', 'bodyweight', 'other');--> statement-breakpoint
CREATE TYPE "public"."muscle" AS ENUM('chest', 'back', 'lower_back', 'shoulders', 'traps', 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'adductors', 'abductors', 'calves', 'abs');--> statement-breakpoint
CREATE TYPE "public"."record_kind" AS ENUM('weight', 'e1rm', 'reps');--> statement-breakpoint
CREATE TYPE "public"."set_type" AS ENUM('normal', 'warmup', 'drop', 'failure');--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text,
	"name" text NOT NULL,
	"primary_muscle" "muscle" NOT NULL,
	"secondary_muscles" "muscle"[] DEFAULT '{}' NOT NULL,
	"equipment" "equipment" NOT NULL,
	"image_path" text,
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "personal_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"kind" "record_kind" NOT NULL,
	"value" numeric(7, 2) NOT NULL,
	"achieved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"exercise_position" smallint NOT NULL,
	"set_position" smallint NOT NULL,
	"set_type" "set_type" DEFAULT 'normal' NOT NULL,
	"weight_kg" numeric(6, 2) NOT NULL,
	"reps" smallint NOT NULL,
	"completed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"target_sets" smallint NOT NULL,
	"rep_min" smallint NOT NULL,
	"rep_max" smallint NOT NULL,
	"rest_seconds" smallint NOT NULL,
	"notes" text,
	CONSTRAINT "rep_range" CHECK ("template_exercises"."rep_min" <= "template_exercises"."rep_max")
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"template_id" uuid,
	"name" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "workout_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"weekdays" smallint[] DEFAULT '{}' NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_set_id_session_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."session_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_sets" ADD CONSTRAINT "session_sets_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_sets" ADD CONSTRAINT "session_sets_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_exercises" ADD CONSTRAINT "template_exercises_template_id_workout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_exercises" ADD CONSTRAINT "template_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_template_id_workout_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercises_owner_id_index" ON "exercises" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "personal_records_user_id_exercise_id_index" ON "personal_records" USING btree ("user_id","exercise_id");--> statement-breakpoint
CREATE INDEX "session_sets_session_id_index" ON "session_sets" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_sets_exercise_id_index" ON "session_sets" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "template_exercises_template_id_index" ON "template_exercises" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "workout_sessions_user_id_started_at_index" ON "workout_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "workout_templates_user_id_index" ON "workout_templates" USING btree ("user_id");