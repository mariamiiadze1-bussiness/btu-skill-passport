CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "notifications_student_idx" ON "notifications" USING btree ("student_id");