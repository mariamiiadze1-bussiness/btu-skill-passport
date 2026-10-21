CREATE TABLE "activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" text,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"version" integer,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anchor_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"network" text NOT NULL,
	"merkle_root" text NOT NULL,
	"tx_hash" text,
	"block_number" integer,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "import_records" (
	"record_id" text PRIMARY KEY NOT NULL,
	"run_id" integer,
	"student_id" text,
	"sheet_row" integer,
	"status" text NOT NULL,
	"version" integer,
	"message" text,
	"row_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"actor_user_id" uuid,
	"status" text NOT NULL,
	"totals" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "locks" (
	"name" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passport_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"version" integer NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_on" date NOT NULL,
	"verification_code" text NOT NULL,
	"skill_ids" text[] NOT NULL,
	"verify_url" text NOT NULL,
	"pdf_sha256" text NOT NULL,
	"merkle_leaf" text NOT NULL,
	"issuer_signature" text NOT NULL,
	"anchor_status" text NOT NULL,
	"anchor_batch_id" integer,
	"merkle_proof" text[],
	CONSTRAINT "passport_versions_verification_code_unique" UNIQUE("verification_code")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"badge_code" text NOT NULL,
	"description" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"catalog_skill_id" text,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"badge_code" text NOT NULL,
	"description" text NOT NULL,
	"date_earned" date NOT NULL,
	"earned_through" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_status_check" CHECK ("skills"."status" in ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"program" text DEFAULT '' NOT NULL,
	"education_level" text DEFAULT '' NOT NULL,
	"passport_id" text NOT NULL,
	"issued_at" date NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_email_unique" UNIQUE("email"),
	CONSTRAINT "students_passport_id_unique" UNIQUE("passport_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"google_sub" text,
	"email_verified_at" timestamp with time zone,
	"role" text NOT NULL,
	"student_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('student', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "verification_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"code_masked" text NOT NULL,
	"passport_version_id" integer,
	"result" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_records" ADD CONSTRAINT "import_records_run_id_import_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."import_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_versions" ADD CONSTRAINT "passport_versions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "passport_versions" ADD CONSTRAINT "passport_versions_anchor_batch_id_anchor_batches_id_fk" FOREIGN KEY ("anchor_batch_id") REFERENCES "public"."anchor_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_catalog_skill_id_skill_catalog_id_fk" FOREIGN KEY ("catalog_skill_id") REFERENCES "public"."skill_catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "verification_checks" ADD CONSTRAINT "verification_checks_passport_version_id_passport_versions_id_fk" FOREIGN KEY ("passport_version_id") REFERENCES "public"."passport_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_created_idx" ON "activity_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "import_records_status_idx" ON "import_records" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "passport_versions_student_version_idx" ON "passport_versions" USING btree ("student_id","version");--> statement-breakpoint
CREATE INDEX "passport_versions_pdf_idx" ON "passport_versions" USING btree ("pdf_sha256");--> statement-breakpoint
CREATE INDEX "passport_versions_anchor_idx" ON "passport_versions" USING btree ("anchor_status");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "skills_student_idx" ON "skills" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "verification_created_idx" ON "verification_checks" USING btree ("created_at");