// Direct access to the e2e database, only to put the starting data in
// place before a test and to move time (a link or a sign-in that "got old").
// Everything else the tests do through the browser.

import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  contactGroups,
  contacts,
  groups,
  notes,
  sessions,
  users,
  verifications,
} from "../src/db/schema";
import { getE2eDatabaseUrls } from "../test/test-url";

type NewContact = Omit<typeof contacts.$inferInsert, "ownerId"> & {
  // Notes written earlier, with their dates
  notes?: { createdAt: Date; body?: string }[];
  // Names of the user's groups the contact is in; a group the user does
  // not have yet is created
  groups?: string[];
};

async function withDatabase<T>(
  body: (client: postgres.Sql) => Promise<T>,
): Promise<T> {
  const client = postgres(getE2eDatabaseUrls().testUrl, {
    max: 1,
    onnotice: () => {},
  });
  try {
    return await body(client);
  } finally {
    await client.end();
  }
}

// Leaves exactly these contacts to the user with this email (who has signed
// in already): their other contacts go, together with their notes and group
// links (ON DELETE CASCADE). Other users are not touched.
// Returns the ids of the new contacts, in the same order.
export async function replaceContacts(
  email: string,
  list: NewContact[],
): Promise<number[]> {
  return withDatabase((client) =>
    drizzle(client).transaction(async (tx) => {
      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.trim().toLowerCase()));
      if (!user) {
        throw new Error(`No user ${email}: sign in first`);
      }
      await tx.delete(contacts).where(eq(contacts.ownerId, user.id));

      const groupIds = new Map<string, number>();
      async function groupId(name: string): Promise<number> {
        const known = groupIds.get(name);
        if (known) {
          return known;
        }
        const [found] = await tx
          .select({ id: groups.id })
          .from(groups)
          .where(and(eq(groups.ownerId, user.id), eq(groups.name, name)));
        const id =
          found?.id ??
          (
            await tx
              .insert(groups)
              .values({ ownerId: user.id, name })
              .returning({ id: groups.id })
          )[0].id;
        groupIds.set(name, id);
        return id;
      }

      const ids: number[] = [];
      for (const {
        notes: noteList = [],
        groups: groupNames = [],
        ...contact
      } of list) {
        const [{ id }] = await tx
          .insert(contacts)
          .values({ ...contact, ownerId: user.id })
          .returning({ id: contacts.id });
        ids.push(id);
        for (const note of noteList) {
          await tx.insert(notes).values({
            contactId: id,
            body: note.body ?? "Созвонились, всё хорошо",
            createdAt: note.createdAt,
          });
        }
        for (const name of groupNames) {
          await tx
            .insert(contactGroups)
            .values({ contactId: id, groupId: await groupId(name) });
        }
      }
      return ids;
    }),
  );
}

// A date by the database clock, "YYYY-MM-DD": today, or some days from it.
// The app picks the year of an own date and its due day by this clock.
export async function databaseDate(daysFromToday = 0): Promise<string> {
  return withDatabase(async (client) => {
    const [{ date }] = await client<{ date: string }[]>`
      select (current_date + ${daysFromToday}::int)::text as date`;
    return date;
  });
}

// The links asked for by this email, not opened yet, "got old": they ended
// a minute ago. Opening one is what happens 16 minutes later.
export async function expireSignInLinks(email: string): Promise<void> {
  await withDatabase(async (client) => {
    await drizzle(client)
      .update(verifications)
      .set({ expiresAt: sql`now() - interval '1 minute'` })
      .where(
        and(
          sql`${verifications.identifier} like 'magic-link:%'`,
          sql`${verifications.value}::jsonb ->> 'email' = ${email.toLowerCase()}`,
        ),
      );
  });
}

// Moves the end of every sign-in of the user: `daysLeft` days from now
// (negative: it ended already). 30 is a sign-in just made.
export async function setSignInDaysLeft(
  email: string,
  daysLeft: number,
): Promise<void> {
  await withDatabase(async (client) => {
    const db = drizzle(client);
    await db
      .update(sessions)
      .set({
        expiresAt: sql`now() + interval '1 day' * ${daysLeft}`,
      })
      .where(
        inArray(
          sessions.userId,
          db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, email.toLowerCase())),
        ),
      );
  });
}

// How many days the sign-ins of the user have left, by the database clock
export async function signInDaysLeft(email: string): Promise<number[]> {
  return withDatabase(async (client) => {
    const rows = await client<{ days: number }[]>`
      select round(extract(epoch from s.expires_at - now()) / 86400)::int as days
      from sessions s join users u on u.id = s.user_id
      where u.email = ${email.toLowerCase()}`;
    return rows.map((row) => row.days);
  });
}

export async function userExists(email: string): Promise<boolean> {
  return withDatabase(async (client) => {
    const rows = await client`
      select 1 from users where email = ${email.toLowerCase()}`;
    return rows.length > 0;
  });
}
