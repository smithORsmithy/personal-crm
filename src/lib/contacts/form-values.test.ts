import { describe, expect, it } from "vitest";

import { parseContactForm } from "./form-values";

function formOf(fields: [string, string][]): FormData {
  const formData = new FormData();
  for (const [key, value] of fields) {
    formData.append(key, value);
  }
  return formData;
}

describe("parseContactForm", () => {
  it("читает выбранные группы и новые названия", () => {
    const parsed = parseContactForm(
      formOf([
        ["name", "Вера"],
        ["groupId", "3"],
        ["groupId", "5"],
        ["newGroup", "Йога"],
      ]),
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.groupIds).toEqual([3, 5]);
    expect(parsed.newGroups).toEqual(["Йога"]);
    if (parsed.ok) {
      expect(parsed.data.name).toBe("Вера");
    }
  });

  it("Ошибка в форме не сбрасывает группы", () => {
    const parsed = parseContactForm(
      formOf([
        ["name", ""],
        ["groupId", "4"],
        ["newGroup", "Йога"],
      ]),
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors.name).toEqual(["Укажите имя"]);
      expect(parsed.groupIds).toEqual([4]);
      expect(parsed.newGroups).toEqual(["Йога"]);
    }
  });

  it("неверные номера групп отбрасываются", () => {
    const parsed = parseContactForm(
      formOf([
        ["name", "Вера"],
        ["groupId", "abc"],
        ["groupId", "-1"],
        ["groupId", "0"],
        ["groupId", "2.5"],
        ["groupId", "7"],
        ["groupId", "7"],
      ]),
    );
    expect(parsed.groupIds).toEqual([7]);
  });

  it("новые названия: пробелы убираются, пустые и повторы отбрасываются", () => {
    const parsed = parseContactForm(
      formOf([
        ["name", "Вера"],
        ["newGroup", "  Йога "],
        ["newGroup", "   "],
        ["newGroup", "йога"],
      ]),
    );
    expect(parsed.newGroups).toEqual(["Йога"]);
  });

  // The text typed in the field but not picked travels as one more
  // "newGroup", after the hidden fields of the labels
  it("вписанное и не выбранное название попадает в новые группы", () => {
    const parsed = parseContactForm(
      formOf([
        ["name", "Вера"],
        ["groupId", "4"],
        ["newGroup", "Йога"],
        ["newGroup", " аналитики "],
      ]),
    );
    expect(parsed.groupIds).toEqual([4]);
    expect(parsed.newGroups).toEqual(["Йога", "аналитики"]);
  });

  it("вписанные одни пробелы не учитываются", () => {
    const parsed = parseContactForm(
      formOf([
        ["name", "Вера"],
        ["newGroup", "    "],
      ]),
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.newGroups).toEqual([]);
  });
});
