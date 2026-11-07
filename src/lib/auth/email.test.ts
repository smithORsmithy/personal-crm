import { describe, expect, it } from "vitest";

import { normalizeEmail } from "./email";

describe("normalizeEmail", () => {
  it("Почта с пробелами и большими буквами", () => {
    expect(normalizeEmail("  Anna@Example.COM  ")).toBe("anna@example.com");
  });

  it("keeps an already clean address as it is", () => {
    expect(normalizeEmail("anna@example.com")).toBe("anna@example.com");
  });

  it("Неверная почта в форме: empty, no domain, no @", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail("anna@")).toBeNull();
    expect(normalizeEmail("anna")).toBeNull();
  });

  it("refuses anything that is not text", () => {
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });
});
