import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SEED_CONTACT_COUNT,
  SEED_RANDOM_SEED,
  buildGroupLinks,
  generateContacts,
  matchTestContacts,
  seedContactKey,
  seedGroupNames,
} from "./seed-data";

describe("Seed data: groups", () => {
  it("Заполнение пустой базы", () => {
    // Every contact gets from zero to two of the initial groups, no repeats
    const seeded = generateContacts(300, 1);
    for (const item of seeded) {
      expect(item.groupNames.length).toBeLessThanOrEqual(2);
      expect(new Set(item.groupNames).size).toBe(item.groupNames.length);
      for (const name of item.groupNames) {
        expect(seedGroupNames).toContain(name);
      }
    }
    // Every count from 0 to 2 happens, and every group is used
    const counts = new Set(seeded.map((item) => item.groupNames.length));
    expect([...counts].sort()).toEqual([0, 1, 2]);
    const used = new Set(seeded.flatMap((item) => item.groupNames));
    expect([...used].sort()).toEqual([...seedGroupNames].sort());
  });

  it("два запуска дают одни и те же группы", () => {
    const first = generateContacts(100, 7).map((item) => item.groupNames);
    const second = generateContacts(100, 7).map((item) => item.groupNames);
    expect(second).toEqual(first);
  });

  it("группы, которых нет в базе, пропускаются", () => {
    const seeded = [
      { groupNames: ["Семья", "Теннис"] },
      { groupNames: ["Теннис"] },
      { groupNames: [] },
    ];
    // "Семья" was renamed or deleted: it is not in the database
    const links = buildGroupLinks(seeded, [10, 11, 12], new Map([["Теннис", 4]]));
    expect(links).toEqual([
      { contactId: 10, groupId: 4 },
      { contactId: 11, groupId: 4 },
    ]);
  });
});

// A test contact is told from one added by hand by five fields
describe("Seed data: telling test contacts", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("у всех тестовых контактов разные ключи", () => {
    const keys = generateContacts(SEED_CONTACT_COUNT, SEED_RANDOM_SEED).map(
      (item) => seedContactKey(item.contact),
    );
    expect(new Set(keys).size).toBe(SEED_CONTACT_COUNT);
  });

  it("ключи не зависят от даты запуска", () => {
    const keysAt = (date: string) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(date));
      const keys = generateContacts(SEED_CONTACT_COUNT, SEED_RANDOM_SEED).map(
        (item) => seedContactKey(item.contact),
      );
      vi.useRealTimers();
      return keys;
    };
    expect(keysAt("2027-06-15T12:00:00Z")).toEqual(
      keysAt("2026-01-01T00:00:00Z"),
    );
  });

  it("ключ первого тестового контакта не меняется", () => {
    // Databases seeded earlier hold exactly this contact: if the generator
    // changes, they can no longer be put into groups
    const [first] = generateContacts(SEED_CONTACT_COUNT, SEED_RANDOM_SEED);
    expect(seedContactKey(first.contact)).toBe(
      JSON.stringify([
        "Руслан Щербаков",
        "Юрист в телеком-компании",
        "Были в одной команде на хакатоне",
        "+7 975 881-09-75",
        "r.shcherbakov@icloud.com",
      ]),
    );
  });

  it("тестовый контакт получает группы сида", () => {
    const seeded = [
      {
        contact: { name: "Анна Смирнова", about: "Дизайнер", howWeMet: null, phone: "+7 900 000-00-01", email: null },
        groupNames: ["Семья", "Теннис"],
      },
      {
        contact: { name: "Олег Петров", about: null, howWeMet: null, phone: "+7 900 000-00-02", email: "oleg@example.com" },
        groupNames: ["Друзья"],
      },
    ];
    const groupIds = new Map([
      ["Семья", 1],
      ["Друзья", 2],
      ["Теннис", 4],
    ]);
    const links = matchTestContacts(
      [
        { id: 10, ...seeded[0].contact },
        // Phone changed by hand: not a test contact any more
        { id: 11, ...seeded[1].contact, phone: "+7 999 999-99-99" },
        // Added by hand
        { id: 12, name: "Иван Иванов", about: "сосед по даче", howWeMet: null, phone: null, email: null },
      ],
      seeded,
      groupIds,
    );
    expect(links).toEqual([
      { contactId: 10, groupId: 1 },
      { contactId: 10, groupId: 4 },
    ]);
  });

  it("группы, которых нет в базе, при раскладке пропускаются", () => {
    const seeded = [
      {
        contact: { name: "Анна Смирнова", about: null, howWeMet: null, phone: null, email: null },
        groupNames: ["Семья", "Теннис"],
      },
    ];
    const links = matchTestContacts(
      [{ id: 10, ...seeded[0].contact }],
      seeded,
      new Map([["Теннис", 4]]),
    );
    expect(links).toEqual([{ contactId: 10, groupId: 4 }]);
  });
});
