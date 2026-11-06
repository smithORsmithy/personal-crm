import { describe, expect, it } from "vitest";

import { canCreateGroup, filterGroups, listFieldItems } from "./match";

const groups = [
  { id: 1, name: "Аналитики" },
  { id: 2, name: "Теннис" },
  { id: 3, name: "Клуб «Ёлка»" },
];

describe("Group search in the Группы field", () => {
  it("Поиск группы при вводе", () => {
    expect(filterGroups(groups, "те").map((group) => group.name)).toEqual([
      "Теннис",
    ]);
    // Capitals do not matter
    expect(filterGroups(groups, "ТЕН").map((group) => group.name)).toEqual([
      "Теннис",
    ]);
    // "е" and "ё" are the same letter
    expect(filterGroups(groups, "елка").map((group) => group.name)).toEqual([
      "Клуб «Ёлка»",
    ]);
    // Nothing typed: every group
    expect(filterGroups(groups, "  ")).toHaveLength(3);
  });

  it("Пункт «Создать группу» для нового названия", () => {
    expect(canCreateGroup(groups, "Йога")).toBe(true);
    expect(canCreateGroup(groups, "  Йога ")).toBe(true);
  });

  it("Нет пункта «Создать группу», если такая группа есть", () => {
    expect(canCreateGroup(groups, "теннис")).toBe(false);
    expect(canCreateGroup(groups, " ТЕННИС ")).toBe(false);
  });

  it("Нет пункта «Создать группу» для пустой строки", () => {
    expect(canCreateGroup(groups, "")).toBe(false);
    expect(canCreateGroup(groups, "   ")).toBe(false);
  });
});

// What the list in the field shows, in order. Enter picks the first item.
const allGroups = [
  { id: 1, name: "Аналитики" },
  { id: 2, name: "Друзья" },
  { id: 3, name: "Знакомые" },
  { id: 4, name: "Семья" },
  { id: 5, name: "Теннис" },
];

function describeItems(query: string) {
  return listFieldItems(allGroups, query).map((item) =>
    item.kind === "group" ? item.group.name : `create:${item.name}`,
  );
}

describe("Items of the list in the Группы field", () => {
  it("Выбрать группу с клавиатуры", () => {
    // Enter picks the first item: the group that matches
    expect(describeItems("анал")[0]).toBe("Аналитики");
  });

  it("Создать группу с клавиатуры", () => {
    // No group matches: "Создать группу «Йога»" is the only, so the first, item
    expect(describeItems("Йога")).toEqual(["create:Йога"]);
    expect(describeItems("  Йога  ")).toEqual(["create:Йога"]);
  });

  it("Подходящие группы — в порядке общего списка, «Создать» — последним", () => {
    // "з" is in "Друзья" and "Знакомые", and "з" itself is a new name
    expect(describeItems("з")).toEqual(["Друзья", "Знакомые", "create:з"]);
  });

  it("Такая группа уже есть: пункта «Создать» нет", () => {
    expect(describeItems("теннис")).toEqual(["Теннис"]);
  });

  it("Пустая строка: все группы без пункта «Создать»", () => {
    expect(describeItems("")).toEqual([
      "Аналитики",
      "Друзья",
      "Знакомые",
      "Семья",
      "Теннис",
    ]);
    expect(describeItems("   ")).toHaveLength(5);
  });
});
