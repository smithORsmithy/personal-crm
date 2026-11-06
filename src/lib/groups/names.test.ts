import { describe, expect, it } from "vitest";

import { parseGroupName } from "./names";

describe("Group name", () => {
  it("Пустое название", () => {
    const message = "Укажите название группы";
    expect(parseGroupName("")).toEqual({ ok: false, error: message });
    expect(parseGroupName("   ")).toEqual({ ok: false, error: message });
    expect(parseGroupName(null)).toEqual({ ok: false, error: message });
  });

  it("Слишком длинное название", () => {
    expect(parseGroupName("я".repeat(51))).toEqual({
      ok: false,
      error: "Название слишком длинное: не больше 50 символов",
    });
    expect(parseGroupName("я".repeat(50))).toEqual({
      ok: true,
      name: "я".repeat(50),
    });
  });

  it("Пробелы по краям", () => {
    expect(parseGroupName("  Йога ")).toEqual({ ok: true, name: "Йога" });
  });
});
