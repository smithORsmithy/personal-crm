import { describe, expect, it } from "vitest";

import {
  formatDayMonth,
  frequencyDisplay,
  nearestDate,
  parseDayMonth,
} from "./frequency";

// The day the spec scenarios are told from
const TODAY = "2026-11-05";

// What the year picker gives for a typed day and month
function dateFor(input: string): string | null {
  const dayMonth = parseDayMonth(input);
  return dayMonth && nearestDate(dayMonth, TODAY);
}

describe("Own date: which year", () => {
  it("Дата ещё будет в этом году", () => {
    expect(dateFor("16.12")).toBe("2026-12-16");
  });

  it("Дата в этом году уже прошла", () => {
    expect(dateFor("01.03")).toBe("2027-03-01");
  });

  it("Сегодняшняя дата", () => {
    expect(dateFor("5.11")).toBe("2026-11-05");
  });

  it("29 февраля", () => {
    expect(dateFor("29.02")).toBe("2028-02-29");
  });

  it("ноль впереди можно не писать: 5.1 — то же, что 05.01", () => {
    expect(parseDayMonth("5.1")).toEqual(parseDayMonth("05.01"));
    expect(dateFor("5.1")).toBe("2027-01-05");
  });
});

describe("Own date: wrong input", () => {
  it("Такой даты не бывает", () => {
    expect(parseDayMonth("31.02")).toBeNull();
    expect(parseDayMonth("16.13")).toBeNull();
  });

  it("Не дата", () => {
    expect(parseDayMonth("завтра")).toBeNull();
    expect(parseDayMonth("16,12")).toBeNull();
    expect(parseDayMonth("")).toBeNull();
  });
});

describe("The frequency field in the card", () => {
  it("Новый контакт без частоты: «Не задано»", () => {
    expect(frequencyDisplay(null, null)).toBe("Не задано");
  });

  it("Карточка без срока: только выбранное значение", () => {
    expect(frequencyDisplay("monthly", null)).toBe("Раз в месяц");
    expect(frequencyDisplay("on_date", "2026-12-16")).toBe("Другое: 16.12");
  });

  it("Поменять свою дату: окошко открывается с уже заданной датой", () => {
    // The dialog field starts with the saved date in this form
    expect(formatDayMonth("2026-12-16")).toBe("16.12");
    expect(formatDayMonth("2027-01-05")).toBe("05.01");
  });
});
