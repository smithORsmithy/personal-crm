import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  primaryKey,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { contactFrequencies } from "../lib/contacts/frequency";

// How often to keep in touch; "on_date" is "Другое" (one own date)
export const contactFrequency = pgEnum("contact_frequency", contactFrequencies);

export const contacts = pgTable(
  "contacts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    // Who the person is: job, role, relation
    about: text("about"),
    howWeMet: text("how_we_met"),
    phone: text("phone"),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    // Set when the contact is deleted. For a few seconds the deletion can be
    // undone; after that the row and its notes are erased for good.
    // Null means the contact is not deleted.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // How often to keep in touch. Null is "Не задано".
    contactFrequency: contactFrequency("contact_frequency"),
    // "Другое": the date to get in touch by, the year already picked
    contactDate: date("contact_date", { mode: "string" }),
    // When that date was set: only notes written after it count
    contactDateSetAt: timestamp("contact_date_set_at", { withTimezone: true }),
  },
  (table) => [
    // Both date fields are set exactly when the frequency is "on_date".
    // CASE, not a plain comparison: with a null frequency a comparison
    // gives null, and CHECK lets null through.
    check(
      "contacts_contact_date_check",
      sql`case when ${table.contactFrequency} = 'on_date'
        then ${table.contactDate} is not null and ${table.contactDateSetAt} is not null
        else ${table.contactDate} is null and ${table.contactDateSetAt} is null end`,
    ),
  ],
);

// Dated notes after conversations: what was discussed and agreed
export const notes = pgTable(
  "notes",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notes_contact_id_created_at_idx").on(
      table.contactId,
      table.createdAt.desc(),
    ),
  ],
);

// Groups of contacts: "Семья", "Теннис" and any own ones
export const groups = pgTable(
  "groups",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Set when the group is deleted. For a few seconds the deletion can be
    // undone; after that the row and its links are erased for good.
    // Null means the group is not deleted.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    // No spaces around the name, 1 to 50 characters
    check(
      "groups_name_check",
      sql`${table.name} = btrim(${table.name}) and char_length(${table.name}) between 1 and 50`,
    ),
    // One name per group, capitals ignored. Deleted groups do not count:
    // a new group may take the name of one deleted a second ago.
    uniqueIndex("groups_name_lower_idx")
      .on(sql`lower(${table.name})`)
      .where(sql`${table.deletedAt} is null`),
  ],
);

// Who is in which group. A contact or a group deleted with "Отменить"
// still available keeps its rows here, so undo brings the people back.
export const contactGroups = pgTable(
  "contact_groups",
  {
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.contactId, table.groupId] }),
    index("contact_groups_group_id_idx").on(table.groupId),
  ],
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
