CREATE TYPE "public"."objective" AS ENUM('lose', 'maintain', 'gain');--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "objective" "objective" NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "body_logs_user_id_logged_on_index" ON "body_logs" USING btree ("user_id","logged_on");--> statement-breakpoint
CREATE INDEX "goals_user_id_started_at_index" ON "goals" USING btree ("user_id","started_at");