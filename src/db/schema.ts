import { sql } from "drizzle-orm";
import {
  boolean,
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

// Users and sign-in. users, sessions, accounts and verifications are the
// core tables of Better Auth (the sign-in library) as its version 1.7 wants
// them; the library finds the columns by the property names below. Names of
// tables and columns follow the rest of the project: plural, snake_case.
// accounts is not used by sign-in with a link, but the library requires it.
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  // Empty: the name is not asked, only the email is shown in the app
  name: text("name").notNull(),
  // Always in lower case, the library writes it so
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// One row per signed-in device (or browser)
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

// Sign-in links waiting to be opened: "magic-link:<token>" in identifier,
// the email inside value. A link is deleted when it is opened.
export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

// Sign-in emails that were sent, to count "no more than 3 per 10 minutes"
// for one email. Written by the database clock, like the other time rules.
export const signInEmails = pgTable(
  "sign_in_emails",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    // Already trimmed and in lower case
    email: text("email").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sign_in_emails_email_sent_at_idx").on(table.email, table.sentAt),
  ],
);

// How often to keep in touch; "on_date" is "Другое" (one own date)
export const contactFrequency = pgEnum("contact_frequency", contactFrequencies);

export const contacts = pgTable(
  "contacts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    // Whose contact it is. No cascade: a user who has contacts cannot be
    // deleted, so contacts are never lost by accident.
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
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
    index("contacts_owner_id_idx").on(table.ownerId),
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
    // Whose group it is; no cascade, like contacts.owner_id
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
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
    // One name per group of one user, capitals ignored: two users may both
    // have "Друзья". Deleted groups do not count: a new group may take the
    // name of one deleted a second ago.
    uniqueIndex("groups_owner_id_name_lower_idx")
      .on(table.ownerId, sql`lower(${table.name})`)
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
