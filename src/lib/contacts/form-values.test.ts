import { describe, expect, it } from "vitest";

import { parseContactForm, parseFrequencyChoice } from "./form-values";

const invalidDate = "Проверьте дату: день и месяц через точку, например 16.12";

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

// "Как часто общаться" in the add form: the list sends "frequency", the
// field under it sends "dayMonth" only while «Другое…» is chosen
describe("parseFrequencyChoice", () => {
  it("Новый контакт без частоты", () => {
    for (const fields of [[], [["frequency", ""]], [["frequency", "none"]]]) {
      const parsed = parseFrequencyChoice(formOf(fields as [string, string][]));
      expect(parsed).toMatchObject({ ok: true, choice: { frequency: null } });
    }
  });

  // Not in the list: the browser was tampered with. Nothing odd is saved.
  it("неизвестное значение — «Не задано»", () => {
    const parsed = parseFrequencyChoice(formOf([["frequency", "daily"]]));
    expect(parsed).toMatchObject({ ok: true, choice: { frequency: null } });
  });

  it("Новый контакт с частотой", () => {
    for (const frequency of ["weekly", "monthly", "quarterly", "yearly"]) {
      const parsed = parseFrequencyChoice(formOf([["frequency", frequency]]));
      expect(parsed).toEqual({
        ok: true,
        choice: { frequency },
        frequency,
        dayMonth: "",
      });
    }
  });

  it("Новый контакт со своей датой", () => {
    expect(
      parseFrequencyChoice(
        formOf([
          ["frequency", "on_date"],
          ["dayMonth", "16.12"],
        ]),
      ),
    ).toEqual({
      ok: true,
      choice: { frequency: "on_date", dayMonth: { day: 16, month: 12 } },
      frequency: "on_date",
      dayMonth: "16.12",
    });
    // The leading zero is optional, spaces around do not matter
    expect(
      parseFrequencyChoice(
        formOf([
          ["frequency", "on_date"],
          ["dayMonth", " 5.1 "],
        ]),
      ),
    ).toMatchObject({
      ok: true,
      choice: { frequency: "on_date", dayMonth: { day: 5, month: 1 } },
    });
  });

  // The field is gone once another option is chosen; a date that still
  // arrives with a frequency is not saved
  it("Передумать со своей датой", () => {
    expect(
      parseFrequencyChoice(
        formOf([
          ["frequency", "yearly"],
          ["dayMonth", "16.12"],
        ]),
      ),
    ).toMatchObject({ ok: true, choice: { frequency: "yearly" } });
  });

  it("Такой даты не бывает в форме", () => {
    for (const dayMonth of ["31.02", "16.13"]) {
      expect(
        parseFrequencyChoice(
          formOf([
            ["frequency", "on_date"],
            ["dayMonth", dayMonth],
          ]),
        ),
      ).toEqual({
        ok: false,
        error: invalidDate,
        frequency: "on_date",
        dayMonth,
      });
    }
  });

  it("Не дата в форме", () => {
    for (const dayMonth of ["завтра", "16,12", "", "   "]) {
      expect(
        parseFrequencyChoice(
          formOf([
            ["frequency", "on_date"],
            ["dayMonth", dayMonth],
          ]),
        ),
      ).toEqual({
        ok: false,
        error: invalidDate,
        frequency: "on_date",
        dayMonth,
      });
    }
    // No field at all
    expect(
      parseFrequencyChoice(formOf([["frequency", "on_date"]])),
    ).toMatchObject({ ok: false, error: invalidDate, dayMonth: "" });
  });
});
