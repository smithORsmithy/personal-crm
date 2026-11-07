import { eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { contactGroups, contacts, groups, notes } from "@/db/schema";
import type { Database } from "@/db/types";
import { formatDate } from "@/lib/format";

import { withRollback } from "../../../test/db";
import { groupIdByName } from "../../../test/fixtures";

import { setContactFrequencyCommand } from "./commands";
import {
  countDueContacts,
  hasContactsWithFrequency,
  selectDueContacts,
} from "./due";
import { frequencyDisplay, type ContactFrequency } from "./frequency";

const NOW = new Date("2026-11-06T12:00:00Z");
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

// A moment in UTC, like the database clock: "2026-11-01T15:00"
function at(moment: string): Date {
  return new Date(`${moment}:00Z`);
}

function minutesAfter(moment: Date, minutes: number): Date {
  return new Date(moment.getTime() + minutes * MINUTE);
}

function daysBefore(moment: Date, days: number): Date {
  return new Date(moment.getTime() - days * DAY);
}

type ContactSetup = {
  name: string;
  about?: string;
  frequency?: ContactFrequency | null;
  // "Другое": the date and the moment it was set
  contactDate?: string;
  contactDateSetAt?: Date;
  createdAt?: Date;
  // Times of the notes, oldest first
  notes?: Date[];
};

// A contact as it would be after living in the app for a while. Added
// with its first note, or long ago when there are no notes.
async function addContactWith(
  db: Database,
  { frequency = null, notes: noteTimes = [], ...fields }: ContactSetup,
): Promise<number> {
  const [contact] = await db
    .insert(contacts)
    .values({
      ...fields,
      contactFrequency: frequency,
      createdAt: fields.createdAt ?? noteTimes[0] ?? at("2024-01-01T12:00"),
    })
    .returning({ id: contacts.id });
  for (const createdAt of noteTimes) {
    await addNote(db, contact.id, createdAt);
  }
  return contact.id;
}

async function addNote(
  db: Database,
  contactId: number,
  createdAt: Date,
  body = "Созвонились, всё хорошо",
) {
  await db.insert(notes).values({ contactId, body, createdAt });
}

// Who is on the "Пора связаться" page at this moment, in its order
async function dueAt(db: Database, now: Date): Promise<string[]> {
  return names(await selectDueContacts(db, now));
}

// Due a minute after the term ends, not a minute before
async function expectTermEnds(db: Database, name: string, end: Date) {
  expect(await dueAt(db, minutesAfter(end, -1))).not.toContain(name);
  expect(await dueAt(db, minutesAfter(end, 1))).toContain(name);
}

// Where an own date's term ends: the start of that day by the database clock
async function dayStart(db: Database, date: string): Promise<Date> {
  const [{ epoch }] = (await db.execute(
    sql`select extract(epoch from ${date}::date::timestamptz) as epoch`,
  )) as unknown as { epoch: string | number }[];
  return new Date(Number(epoch) * 1000);
}

// A contact with a weekly rhythm, added `daysAgo` days before NOW: the
// longer ago, the more overdue
async function addDueContact(
  db: Database,
  name: string,
  daysAgo: number,
  groupNames: string[],
) {
  const [contact] = await db
    .insert(contacts)
    .values({
      name,
      contactFrequency: "weekly",
      createdAt: new Date(NOW.getTime() - daysAgo * DAY),
    })
    .returning({ id: contacts.id });
  for (const groupName of groupNames) {
    await db.insert(contactGroups).values({
      contactId: contact.id,
      groupId: await groupIdByName(db, groupName),
    });
  }
}

// Анна (Друзья) and Ира (Друзья, Семья) are overdue, Олег (Теннис) less so
async function fill(db: Database) {
  await addDueContact(db, "Анна", 30, ["Друзья"]);
  await addDueContact(db, "Ира", 20, ["Друзья", "Семья"]);
  await addDueContact(db, "Олег", 10, ["Теннис"]);
}

const names = (list: { name: string }[]) => list.map((item) => item.name);

describe("Keep in touch: where a regular term starts", () => {
  it("Отсчёт от последней заметки", async () => {
    await withRollback(async (db) => {
      await addContactWith(db, {
        name: "Анна",
        frequency: "monthly",
        notes: [at("2026-09-01T12:00"), at("2026-10-20T12:00")],
      });
      await expectTermEnds(db, "Анна", at("2026-11-20T12:00"));
    });
  });

  it("Отсчёт от даты добавления, если заметок нет", async () => {
    await withRollback(async (db) => {
      const id = await addContactWith(db, {
        name: "Анна",
        createdAt: at("2026-09-01T12:00"),
      });
      // On 5 November "Раз в месяц" is chosen in the card
      await setContactFrequencyCommand(db, id, "monthly");
      expect(await dueAt(db, at("2026-11-05T12:00"))).toEqual(["Анна"]);
    });
  });

  it("Новая заметка запускает отсчёт заново", async () => {
    await withRollback(async (db) => {
      const id = await addContactWith(db, {
        name: "Анна",
        frequency: "weekly",
        notes: [daysBefore(NOW, 30)],
      });
      expect(await dueAt(db, NOW)).toEqual(["Анна"]);

      await addNote(db, id, NOW);
      expect(await dueAt(db, minutesAfter(NOW, 1))).toEqual([]);
      // The next term is a week from the new note
      await expectTermEnds(db, "Анна", minutesAfter(NOW, 7 * 24 * 60));
    });
  });

  it("Смена частоты считается от той же точки", async () => {
    await withRollback(async (db) => {
      const id = await addContactWith(db, {
        name: "Анна",
        frequency: "yearly",
        notes: [at("2026-09-06T12:00")],
      });
      expect(await dueAt(db, NOW)).toEqual([]);

      await setContactFrequencyCommand(db, id, "monthly");
      expect(await dueAt(db, NOW)).toEqual(["Анна"]);
    });
  });

  it("Со своей даты на частоту", async () => {
    await withRollback(async (db) => {
      const id = await addContactWith(db, {
        name: "Анна",
        frequency: "on_date",
        contactDate: "2026-12-16",
        contactDateSetAt: at("2026-11-05T12:00"),
        notes: [at("2026-09-06T12:00")],
      });
      expect(await dueAt(db, NOW)).toEqual([]);

      await setContactFrequencyCommand(db, id, "monthly");
      expect(await dueAt(db, NOW)).toEqual(["Анна"]);
    });
  });
});

describe("Keep in touch: how long a term is", () => {
  it("Неделя", async () => {
    await withRollback(async (db) => {
      await addContactWith(db, {
        name: "Анна",
        frequency: "weekly",
        notes: [at("2026-11-01T15:00")],
      });
      await expectTermEnds(db, "Анна", at("2026-11-08T15:00"));
    });
  });

  it("Месяц, квартал и год по календарю", async () => {
    await withRollback(async (db) => {
      const lastNote = [at("2026-11-05T12:00")];
      await addContactWith(db, {
        name: "Месяц",
        frequency: "monthly",
        notes: lastNote,
      });
      await addContactWith(db, {
        name: "Квартал",
        frequency: "quarterly",
        notes: lastNote,
      });
      await addContactWith(db, {
        name: "Год",
        frequency: "yearly",
        notes: lastNote,
      });
      await expectTermEnds(db, "Месяц", at("2026-12-05T12:00"));
      await expectTermEnds(db, "Квартал", at("2027-02-05T12:00"));
      await expectTermEnds(db, "Год", at("2027-11-05T12:00"));
    });
  });

  it("В месяце нет такого дня", async () => {
    await withRollback(async (db) => {
      await addContactWith(db, {
        name: "Анна",
        frequency: "monthly",
        notes: [at("2027-01-31T12:00")],
      });
      await expectTermEnds(db, "Анна", at("2027-02-28T12:00"));
    });
  });
});

describe("Keep in touch: when a regular term is over", () => {
  async function weeklyFromFirstNovember(db: Database) {
    await addContactWith(db, {
      name: "Анна",
      frequency: "weekly",
      notes: [at("2026-11-01T15:00")],
    });
  }

  it("Срок ещё не прошёл", async () => {
    await withRollback(async (db) => {
      await weeklyFromFirstNovember(db);
      expect(await dueAt(db, at("2026-11-08T14:00"))).toEqual([]);
    });
  });

  it("Срок прошёл", async () => {
    await withRollback(async (db) => {
      await weeklyFromFirstNovember(db);
      expect(await dueAt(db, at("2026-11-08T16:00"))).toEqual(["Анна"]);
    });
  });
});

describe("Keep in touch: own date", () => {
  // "Другое: 16.12" set on 5 November
  async function addIra(db: Database, noteTimes: Date[] = []) {
    return addContactWith(db, {
      name: "Ира",
      frequency: "on_date",
      contactDate: "2026-12-16",
      contactDateSetAt: at("2026-11-05T12:00"),
      createdAt: at("2026-01-10T12:00"),
      notes: noteTimes,
    });
  }

  it("Дата ещё не наступила", async () => {
    await withRollback(async (db) => {
      await addIra(db);
      // The last minute of 15 December
      const date = await dayStart(db, "2026-12-16");
      expect(await dueAt(db, minutesAfter(date, -1))).toEqual([]);
    });
  });

  it("Дата наступила", async () => {
    await withRollback(async (db) => {
      await addIra(db);
      const date = await dayStart(db, "2026-12-16");
      expect(await dueAt(db, date)).toEqual(["Ира"]);
      expect(await dueAt(db, at("2027-01-20T12:00"))).toEqual(["Ира"]);
    });
  });

  it("Пообщались до даты", async () => {
    await withRollback(async (db) => {
      await addIra(db, [at("2026-12-10T12:00")]);
      expect(await dueAt(db, at("2026-12-16T12:00"))).toEqual([]);
    });
  });

  it("Заметка до того, как задали дату, не считается", async () => {
    await withRollback(async (db) => {
      await addIra(db, [at("2026-11-01T12:00")]);
      expect(await dueAt(db, at("2026-12-16T12:00"))).toEqual(["Ира"]);
    });
  });

  it("После заметки больше не появляется", async () => {
    await withRollback(async (db) => {
      const id = await addIra(db);
      expect(await dueAt(db, at("2026-12-16T12:00"))).toEqual(["Ира"]);

      await addNote(db, id, at("2026-12-16T13:00"));
      for (const later of [
        at("2026-12-23T13:00"),
        at("2027-01-16T13:00"),
        at("2027-12-16T13:00"),
      ]) {
        expect(await dueAt(db, later)).toEqual([]);
      }
      // The card still shows the date
      const [row] = await db.select().from(contacts).where(eq(contacts.id, id));
      expect(frequencyDisplay(row.contactFrequency, row.contactDate)).toBe(
        "Другое: 16.12",
      );
    });
  });

  it("Новая дата — новый отсчёт", async () => {
    await withRollback(async (db) => {
      const id = await addIra(db, [at("2026-12-17T12:00")]);
      expect(await dueAt(db, at("2026-12-18T12:00"))).toEqual([]);

      // "Другое: 10.01" chosen on 20 December, as the card saves it
      await db
        .update(contacts)
        .set({
          contactDate: "2027-01-10",
          contactDateSetAt: at("2026-12-20T12:00"),
        })
        .where(eq(contacts.id, id));
      const date = await dayStart(db, "2027-01-10");
      expect(await dueAt(db, minutesAfter(date, -1))).toEqual([]);
      expect(await dueAt(db, date)).toEqual(["Ира"]);
    });
  });
});

describe("Keep in touch: who is never on the list", () => {
  it("Частота не задана", async () => {
    await withRollback(async (db) => {
      await addContactWith(db, {
        name: "Анна",
        notes: [daysBefore(NOW, 2 * 365)],
      });
      expect(await dueAt(db, NOW)).toEqual([]);
      expect(await countDueContacts(db, NOW)).toBe(0);
    });
  });

  it("Удалённый контакт", async () => {
    await withRollback(async (db) => {
      const anna = await addContactWith(db, {
        name: "Анна",
        frequency: "weekly",
        notes: [daysBefore(NOW, 30)],
      });
      const ira = await addContactWith(db, {
        name: "Ира",
        frequency: "on_date",
        contactDate: "2026-10-01",
        contactDateSetAt: at("2026-09-01T12:00"),
      });
      expect(await dueAt(db, NOW)).toEqual(["Анна", "Ира"]);

      // Deleted: "Отменить" is still available, the row is still there
      const markDeleted = (deletedAt: Date | null) =>
        db
          .update(contacts)
          .set({ deletedAt })
          .where(inArray(contacts.id, [anna, ira]));
      await markDeleted(NOW);
      expect(await dueAt(db, NOW)).toEqual([]);
      expect(await countDueContacts(db, NOW)).toBe(0);

      // "Отменить": back with the frequency and the date they had
      await markDeleted(null);
      expect(await dueAt(db, NOW)).toEqual(["Анна", "Ира"]);
      const rows = await db
        .select()
        .from(contacts)
        .where(inArray(contacts.id, [anna, ira]))
        .orderBy(contacts.id);
      expect(
        rows.map((row) =>
          frequencyDisplay(row.contactFrequency, row.contactDate),
        ),
      ).toEqual(["Раз в неделю", "Другое: 01.10"]);
    });
  });
});

describe("Keep in touch: order on the page", () => {
  // The people of the spec under other names: Анна, Ира and Олег there go
  // in the order of the alphabet, so the test could not tell the overdue
  // order from it. Here the expected order is the reverse of the alphabet.
  // "Анна" of the spec: 3 weeks at "Раз в неделю" (3 terms) — here Олег.
  // "Олег" of the spec: 13 months at "Раз в год" (about 1.08 terms) — here
  // Анна, added first, so the order does not come from the order of adding.
  async function addWeeklyAndYearly(db: Database) {
    await addContactWith(db, {
      name: "Анна",
      frequency: "yearly",
      notes: [at("2025-10-06T12:00")],
    });
    await addContactWith(db, {
      name: "Олег",
      frequency: "weekly",
      notes: [daysBefore(NOW, 21)],
    });
  }

  it("Частое общение просрочено сильнее", async () => {
    await withRollback(async (db) => {
      await addWeeklyAndYearly(db);
      expect(await dueAt(db, NOW)).toEqual(["Олег", "Анна"]);
    });
  });

  it("Своя дата среди остальных", async () => {
    await withRollback(async (db) => {
      await addWeeklyAndYearly(db);
      // The own date passed 2 months ago with no notes: like a year that
      // ended then, 14 months have passed (about 1.17 terms)
      await addContactWith(db, {
        name: "Ира",
        frequency: "on_date",
        contactDate: "2026-09-06",
        contactDateSetAt: at("2026-06-01T12:00"),
      });
      expect(await dueAt(db, NOW)).toEqual(["Олег", "Ира", "Анна"]);
    });
  });

  it("своя дата считается как «Раз в год», закончившийся в эту дату", async () => {
    await withRollback(async (db) => {
      // The same term as Борис's year from his last note: the same overdue,
      // so the name decides
      await addContactWith(db, {
        name: "Ира",
        frequency: "on_date",
        contactDate: "2026-09-06",
        contactDateSetAt: at("2026-06-01T12:00"),
      });
      await addContactWith(db, {
        name: "Борис",
        frequency: "yearly",
        notes: [await dayStart(db, "2025-09-06")],
      });
      expect(await dueAt(db, NOW)).toEqual(["Борис", "Ира"]);
    });
  });

  it("Одинаковое превышение", async () => {
    await withRollback(async (db) => {
      const sameTime = [daysBefore(NOW, 10)];
      await addContactWith(db, {
        name: "Вера",
        frequency: "weekly",
        notes: sameTime,
      });
      await addContactWith(db, {
        name: "Борис",
        frequency: "weekly",
        notes: sameTime,
      });
      expect(await dueAt(db, NOW)).toEqual(["Борис", "Вера"]);
    });
  });
});

describe("Keep in touch: a row on the page", () => {
  it("Строка контакта с заметками", async () => {
    await withRollback(async (db) => {
      const lastNote =
        "Обсудили переезд в Казань, обещал прислать контакты риелтора. " +
        "Ещё говорили про новую работу: ".repeat(10);
      const id = await addContactWith(db, {
        name: "Анна",
        about: "дизайнер интерфейсов",
        frequency: "weekly",
        notes: [at("2026-08-01T12:00")],
      });
      await addNote(db, id, at("2026-09-03T12:00"), lastNote);

      const [row] = await selectDueContacts(db, NOW);
      expect(row.name).toBe("Анна");
      expect(row.about).toBe("дизайнер интерфейсов");
      expect(formatDate(row.lastNoteAt!)).toBe("3 сентября 2026");
      // The start of the last note; the page cuts it to two lines
      expect(row.lastNoteExcerpt).toMatch(/^Обсудили переезд в Казань/);
      expect(lastNote.startsWith(row.lastNoteExcerpt!)).toBe(true);
    });
  });

  it("«Кто это» не заполнено", async () => {
    await withRollback(async (db) => {
      await addContactWith(db, {
        name: "Анна",
        frequency: "weekly",
        notes: [daysBefore(NOW, 30)],
      });
      const [row] = await selectDueContacts(db, NOW);
      expect(row.about).toBeNull();
    });
  });

  it("Строка контакта без заметок", async () => {
    await withRollback(async (db) => {
      await addContactWith(db, {
        name: "Анна",
        frequency: "weekly",
        createdAt: daysBefore(NOW, 30),
      });
      const [row] = await selectDueContacts(db, NOW);
      expect(row.name).toBe("Анна");
      expect(row.lastNoteAt).toBeNull();
      expect(row.lastNoteExcerpt).toBeNull();
    });
  });
});

describe("Keep in touch: empty page", () => {
  it("Частота задана, но сроки не прошли", async () => {
    await withRollback(async (db) => {
      await addContactWith(db, {
        name: "Анна",
        frequency: "weekly",
        notes: [daysBefore(NOW, 2)],
      });
      await addContactWith(db, {
        name: "Ира",
        frequency: "on_date",
        contactDate: "2026-12-16",
        contactDateSetAt: at("2026-11-05T12:00"),
      });
      // Nobody is due, but someone has a frequency: «Со всеми на связи»
      expect(await dueAt(db, NOW)).toEqual([]);
      expect(await hasContactsWithFrequency(db)).toBe(true);
    });
  });

  it("Частота не задана ни у кого", async () => {
    await withRollback(async (db) => {
      await addContactWith(db, { name: "Анна", notes: [daysBefore(NOW, 400)] });
      await addContactWith(db, { name: "Ира" });
      // «Частота пока не задана» with the hint
      expect(await hasContactsWithFrequency(db)).toBe(false);
    });
  });
});

describe("Keep in touch: the number on the home page button", () => {
  async function addThreeDue(db: Database) {
    const ids: number[] = [];
    for (const name of ["Анна", "Ира", "Олег"]) {
      ids.push(
        await addContactWith(db, {
          name,
          frequency: "weekly",
          notes: [daysBefore(NOW, 30)],
        }),
      );
    }
    return ids;
  }

  it("Есть с кем связаться", async () => {
    await withRollback(async (db) => {
      await addThreeDue(db);
      expect(await countDueContacts(db, NOW)).toBe(3);
    });
  });

  it("Не с кем связаться", async () => {
    await withRollback(async (db) => {
      await addContactWith(db, {
        name: "Анна",
        frequency: "weekly",
        notes: [daysBefore(NOW, 2)],
      });
      expect(await countDueContacts(db, NOW)).toBe(0);
    });
  });

  it("Число обновляется после заметки", async () => {
    await withRollback(async (db) => {
      const [anna] = await addThreeDue(db);
      await addNote(db, anna, NOW);
      expect(await countDueContacts(db, minutesAfter(NOW, 1))).toBe(2);
    });
  });
});

describe("Keep in touch: filter by group", () => {
  it("Только одна группа", async () => {
    await withRollback(async (db) => {
      await fill(db);
      const friends = await groupIdByName(db, "Друзья");
      const all = names(await selectDueContacts(db, NOW));
      const filtered = names(await selectDueContacts(db, NOW, friends));
      expect(all).toEqual(["Анна", "Ира", "Олег"]);
      // The same order as without the filter, Олег is gone
      expect(filtered).toEqual(all.filter((name) => name !== "Олег"));
      expect(filtered).toEqual(["Анна", "Ира"]);
    });
  });

  it("Снять фильтр", async () => {
    await withRollback(async (db) => {
      await fill(db);
      const list = await selectDueContacts(db, NOW, undefined);
      expect(names(list)).toEqual(["Анна", "Ира", "Олег"]);
    });
  });

  it("Из группы никому не пора написать", async () => {
    await withRollback(async (db) => {
      await fill(db);
      // Nobody is in "Знакомые"
      const list = await selectDueContacts(
        db,
        NOW,
        await groupIdByName(db, "Знакомые"),
      );
      expect(list).toEqual([]);
    });
  });

  it("Число на главной не зависит от фильтра", async () => {
    await withRollback(async (db) => {
      await fill(db);
      expect(await countDueContacts(db, NOW)).toBe(3);
    });
  });

  it("Удалённая группа ничего не показывает", async () => {
    await withRollback(async (db) => {
      await fill(db);
      const friends = await groupIdByName(db, "Друзья");
      await db
        .update(groups)
        .set({ deletedAt: NOW })
        .where(eq(groups.id, friends));
      expect(await selectDueContacts(db, NOW, friends)).toEqual([]);
    });
  });
});
