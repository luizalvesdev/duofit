CREATE TABLE "meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" smallint NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meals_user_id_index" ON "meals" USING btree ("user_id");--> statement-breakpoint
-- Every existing user gets the five meals that used to be hard-coded.
INSERT INTO "meals" ("user_id", "name", "position")
SELECT u."id", d."name", d."position"
FROM "users" u
CROSS JOIN (VALUES ('Café da manhã', 0), ('Almoço', 1), ('Lanche', 2), ('Jantar', 3), ('Ceia', 4)) AS d("name", "position");
--> statement-breakpoint
ALTER TABLE "food_logs" ADD COLUMN "meal_id" uuid;--> statement-breakpoint
ALTER TABLE "meal_plan_items" ADD COLUMN "meal_id" uuid;--> statement-breakpoint
UPDATE "food_logs" f SET "meal_id" = m."id"
FROM "meals" m
WHERE m."user_id" = f."user_id"
  AND m."position" = CASE f."meal" WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 WHEN 'snack' THEN 2 WHEN 'dinner' THEN 3 WHEN 'supper' THEN 4 END;
--> statement-breakpoint
UPDATE "meal_plan_items" p SET "meal_id" = m."id"
FROM "meals" m
WHERE m."user_id" = p."user_id"
  AND m."position" = CASE p."meal" WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 WHEN 'snack' THEN 2 WHEN 'dinner' THEN 3 WHEN 'supper' THEN 4 END;
--> statement-breakpoint
ALTER TABLE "food_logs" ALTER COLUMN "meal_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_plan_items" ALTER COLUMN "meal_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_items" ADD CONSTRAINT "meal_plan_items_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_logs" DROP COLUMN "meal";--> statement-breakpoint
ALTER TABLE "meal_plan_items" DROP COLUMN "meal";--> statement-breakpoint
DROP TYPE "public"."meal";
