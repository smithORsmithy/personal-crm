CREATE TABLE "contact_groups" (
	"contact_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	CONSTRAINT "contact_groups_contact_id_group_id_pk" PRIMARY KEY("contact_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "groups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "groups_name_check" CHECK ("groups"."name" = btrim("groups"."name") and char_length("groups"."name") between 1 and 50)
);
--> statement-breakpoint
ALTER TABLE "contact_groups" ADD CONSTRAINT "contact_groups_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_groups" ADD CONSTRAINT "contact_groups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_groups_group_id_idx" ON "contact_groups" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_name_lower_idx" ON "groups" USING btree (lower("name")) WHERE "groups"."deleted_at" is null;