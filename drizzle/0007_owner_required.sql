DROP INDEX "groups_name_lower_idx";--> statement-breakpoint
ALTER TABLE "contacts" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "groups_owner_id_name_lower_idx" ON "groups" USING btree ("owner_id",lower("name")) WHERE "groups"."deleted_at" is null;