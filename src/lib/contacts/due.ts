// The "пора связаться" rule, in one place for the page and for the count
// on the home page, so the two always agree.
// Nothing is stored ahead: every query works the due time out from the data
// as it is now. The functions take the database (or a transaction) and the
// current moment, so a check script can ask "who is due on 8 November at
// 16:00" without waiting. No "server-only" and no Next.js here for the
// same reason; the app calls them through queries.ts.

import {
  and,
  count,
  desc,
  eq,
  isNotNull,
  isNull,
  sql,
  type SQL,
} from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { contacts, notes } from "@/db/schema";

import { frequencyIntervals, regularFrequencies } from "./frequency";

// The app's database or a transaction: only select is used
export type Db = Pick<PgDatabase<PgQueryResultHKT>, "select">;

// Without a moment given, the database clock decides, like everywhere else
function nowSql(now?: Date): SQL {
  return now ? sql`${now.toISOString()}::timestamptz` : sql`now()`;
}

// Contacts that can show up at all: not deleted, a frequency or a date set
const withFrequency = and(
  isNull(contacts.deletedAt),
  isNotNull(contacts.contactFrequency),
);

// The latest note of each contact. LATERAL runs it per contact, along the
// notes_contact_id_created_at_idx index.
function lastNoteOf(db: Db) {
  return db
    .select({
      createdAt: notes.createdAt,
      // Enough for two lines on the page: long notes stay on the server
      excerpt: sql<string>`left(${notes.body}, 300)`.as("excerpt"),
    })
    .from(notes)
    .where(eq(notes.contactId, contacts.id))
    .orderBy(desc(notes.createdAt), desc(notes.id))
    .limit(1)
    .as("last_note");
}

type LastNote = ReturnType<typeof lastNoteOf>;

// Start and end of the current term, and whether it is over.
// - Weekly, monthly, quarterly, yearly: the term starts at the last note,
//   or when the contact was added if there are no notes, and lasts the
//   interval. Due once the end has passed.
// - Own date ("on_date"): the term ends at the start of that day by the
//   database clock and is counted as a year long, so its overdue ratio
//   compares with "yearly". Due from that day on, unless a note was written
//   after the date was set.
function dueRule(lastNote: LastNote, now?: Date) {
  const current = nowSql(now);
  const isOnDate = sql`${contacts.contactFrequency} = 'on_date'`;
  const regularStart = sql`coalesce(${lastNote.createdAt}, ${contacts.createdAt})`;
  const interval = sql`case ${contacts.contactFrequency} ${sql.join(
    regularFrequencies.map(
      (frequency) =>
        sql`when ${frequency} then ${frequencyIntervals[frequency]}::interval`,
    ),
    sql` `,
  )} end`;
  const dateStart = sql`${contacts.contactDate}::timestamptz`;

  const start = sql`case when ${isOnDate}
    then ${dateStart} - interval '1 year'
    else ${regularStart} end`;
  const end = sql`case when ${isOnDate}
    then ${dateStart}
    else ${regularStart} + ${interval} end`;

  const isDue = sql`case when ${isOnDate}
    then ${end} <= ${current} and (${lastNote.createdAt} is null
      or ${lastNote.createdAt} <= ${contacts.contactDateSetAt})
    else ${end} < ${current} end`;

  // How many terms have passed since the start: 3 weeks at "weekly" is 3
  const overdueRatio = sql`extract(epoch from ${current} - ${start})
    / extract(epoch from ${end} - ${start})`;

  return { isDue, overdueRatio };
}

// Only the people of one group. A deleted group has no people, even while
// the deletion can be undone. "contacts.id" is written out: Drizzle leaves
// the table name off a column inside a select, and a bare "id" would mean
// groups.id here.
function inGroup(groupId: number): SQL {
  return sql`exists (
    select 1 from contact_groups cg
    join groups g on g.id = cg.group_id
    where cg.contact_id = contacts.id and cg.group_id = ${groupId}
      and g.deleted_at is null
  )`;
}

// The "Пора связаться" page: the most overdue first, then by name
// in Russian order (as in the contact list), then by id. With a group,
// only its people; the order stays the same.
export async function selectDueContacts(db: Db, now?: Date, groupId?: number) {
  const lastNote = lastNoteOf(db);
  const { isDue, overdueRatio } = dueRule(lastNote, now);
  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      about: contacts.about,
      lastNoteAt: lastNote.createdAt,
      lastNoteExcerpt: lastNote.excerpt,
    })
    .from(contacts)
    .leftJoinLateral(lastNote, sql`true`)
    .where(
      and(
        withFrequency,
        isDue,
        groupId === undefined ? undefined : inGroup(groupId),
      ),
    )
    .orderBy(
      sql`${overdueRatio} desc`,
      sql`${contacts.name} collate "ru-x-icu"`,
      contacts.id,
    );
}

export type DueContact = Awaited<ReturnType<typeof selectDueContacts>>[number];

// The number on the "Пора связаться" button
export async function countDueContacts(db: Db, now?: Date): Promise<number> {
  const lastNote = lastNoteOf(db);
  const { isDue } = dueRule(lastNote, now);
  const [{ value }] = await db
    .select({ value: count() })
    .from(contacts)
    .leftJoinLateral(lastNote, sql`true`)
    .where(and(withFrequency, isDue));
  return value;
}

// Picks the empty page text: "Со всеми на связи" or "Частота пока не задана"
export async function hasContactsWithFrequency(db: Db): Promise<boolean> {
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(withFrequency)
    .limit(1);
  return rows.length > 0;
}
