CREATE TYPE "public"."contact_frequency" AS ENUM('weekly', 'monthly', 'quarterly', 'yearly', 'on_date');--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "contact_frequency" "contact_frequency";--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "contact_date" date;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "contact_date_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_contact_date_check" CHECK (case when "contacts"."contact_frequency" = 'on_date'
        then "contacts"."contact_date" is not null and "contacts"."contact_date_set_at" is not null
        else "contacts"."contact_date" is null and "contacts"."contact_date_set_at" is null end);