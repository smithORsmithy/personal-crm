import { expect, test } from "vitest";

// Deliberately failing: proves that main protection blocks a PR with red
// CI. The PR with this file is closed without merging.
test("deliberately fails to check main protection", () => {
  expect(1 + 1).toBe(3);
});
