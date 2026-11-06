import { describe, expect, it } from "vitest";

import { filterContacts, parseGroupParam } from "./filter";

const TENNIS = 4;
const FAMILY = 2;

const contacts = [
  { id: 1, name: "Анна Смирнова", groupIds: [TENNIS] },
  { id: 2, name: "Олег Петров", groupIds: [TENNIS] },
  { id: 3, name: "Пётр Иванов", groupIds: [] },
  { id: 4, name: "Анна Белова", groupIds: [] },
];

const names = (list: { name: string }[]) => list.map((item) => item.name);

describe("Filter by group and search", () => {
  it("Выбрать группу", () => {
    const result = filterContacts(contacts, { query: "", groupId: TENNIS });
    expect(names(result)).toEqual(["Анна Смирнова", "Олег Петров"]);
  });

  it("Снять фильтр", () => {
    expect(filterContacts(contacts, { query: "", groupId: null })).toHaveLength(
      4,
    );
  });

  it("Фильтр и поиск вместе", () => {
    const result = filterContacts(contacts, { query: "анна", groupId: TENNIS });
    expect(names(result)).toEqual(["Анна Смирнова"]);
  });

  it("В группе никого", () => {
    expect(filterContacts(contacts, { query: "", groupId: FAMILY })).toEqual(
      [],
    );
  });

  it("Поиск: слова в любом порядке", () => {
    const result = filterContacts(contacts, {
      query: "смирнова анна",
      groupId: null,
    });
    expect(names(result)).toEqual(["Анна Смирнова"]);
  });

  it("Поиск: «е» и «ё» одинаковы", () => {
    expect(
      names(filterContacts(contacts, { query: "петр", groupId: null })),
    ).toEqual(["Олег Петров", "Пётр Иванов"]);
    expect(
      names(filterContacts(contacts, { query: "ПЁТР", groupId: null })),
    ).toEqual(["Олег Петров", "Пётр Иванов"]);
  });
});

describe("The ?group= address parameter", () => {
  const groups = [{ id: TENNIS }, { id: FAMILY }];

  it("Фильтр после перезагрузки", () => {
    expect(parseGroupParam("4", groups)).toBe(TENNIS);
  });

  it("Выбранную группу удалили", () => {
    // A number that is not among the groups, or rubbish, means "Все"
    expect(parseGroupParam("99", groups)).toBeNull();
    expect(parseGroupParam("abc", groups)).toBeNull();
    expect(parseGroupParam(["4", "2"], groups)).toBeNull();
    expect(parseGroupParam(undefined, groups)).toBeNull();
    expect(parseGroupParam("", groups)).toBeNull();
  });
});
