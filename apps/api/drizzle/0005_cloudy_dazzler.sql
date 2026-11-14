CREATE TYPE "public"."food_source" AS ENUM('taco', 'reference', 'custom');--> statement-breakpoint
CREATE TYPE "public"."meal" AS ENUM('breakfast', 'lunch', 'snack', 'dinner', 'supper');--> statement-breakpoint
CREATE TABLE "campaign_members" (
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"share_diet" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_members_campaign_id_user_id_pk" PRIMARY KEY("campaign_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"invite_code" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_inviteCode_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "food_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"logged_on" date NOT NULL,
	"meal" "meal" NOT NULL,
	"food_id" uuid NOT NULL,
	"food_name" text NOT NULL,
	"grams" numeric(6, 1) NOT NULL,
	"kcal" numeric(7, 1) NOT NULL,
	"protein" numeric(6, 1) NOT NULL,
	"carbs" numeric(6, 1) NOT NULL,
	"fat" numeric(6, 1) NOT NULL,
	"plan_item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "food_source" NOT NULL,
	"source_key" text,
	"name" text NOT NULL,
	"search_name" text NOT NULL,
	"category" text,
	"kcal" numeric(6, 1) NOT NULL,
	"protein" numeric(6, 1) NOT NULL,
	"carbs" numeric(6, 1) NOT NULL,
	"fat" numeric(6, 1) NOT NULL,
	"fiber" numeric(6, 1) NOT NULL,
	"serving_name" text,
	"serving_grams" numeric(6, 1),
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "foods_sourceKey_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE TABLE "meal_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"meal" "meal" NOT NULL,
	"food_id" uuid NOT NULL,
	"grams" numeric(6, 1) NOT NULL,
	"position" smallint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_plan_item_id_meal_plan_items_id_fk" FOREIGN KEY ("plan_item_id") REFERENCES "public"."meal_plan_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_items" ADD CONSTRAINT "meal_plan_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_items" ADD CONSTRAINT "meal_plan_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_members_user_id_index" ON "campaign_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "food_logs_user_id_logged_on_index" ON "food_logs" USING btree ("user_id","logged_on");--> statement-breakpoint
CREATE INDEX "foods_owner_id_index" ON "foods" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "meal_plan_items_user_id_index" ON "meal_plan_items" USING btree ("user_id");