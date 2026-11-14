ALTER TABLE "personal_records" DROP CONSTRAINT "personal_records_exercise_id_exercises_id_fk";
--> statement-breakpoint
ALTER TABLE "session_sets" DROP CONSTRAINT "session_sets_exercise_id_exercises_id_fk";
--> statement-breakpoint
ALTER TABLE "template_exercises" DROP CONSTRAINT "template_exercises_exercise_id_exercises_id_fk";
--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_sets" ADD CONSTRAINT "session_sets_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_exercises" ADD CONSTRAINT "template_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;