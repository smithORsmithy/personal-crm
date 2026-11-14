// Catches what the code prints to the console, the way Node would print it,
// so a test can check what would end up in the app log.

import { inspect } from "node:util";

import { expect, vi } from "vitest";

const METHODS = ["error", "warn", "log"] as const;
type Method = (typeof METHODS)[number];

export type ConsoleCapture = {
  // Everything printed, one line per call
  text(): string;
  // What was printed through one method only
  textOf(method: Method): string;
};

// Replaces console.error, console.warn and console.log until
// vi.restoreAllMocks() (the tests call it in afterEach)
export function captureConsole(): ConsoleCapture {
  const calls: { method: Method; line: string }[] = [];
  for (const method of METHODS) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      calls.push({ method, line: args.map(printed).join(" ") });
    });
  }
  const join = (method?: Method) =>
    calls
      .filter((call) => !method || call.method === method)
      .map((call) => call.line)
      .join("\n");
  return { text: () => join(), textOf: (method) => join(method) };
}

// One value as the console or Next.js prints it: a string as it is, anything
// else through util.inspect with every nested cause and field
export function printed(value: unknown): string {
  return typeof value === "string"
    ? value
    : inspect(value, { depth: Infinity });
}

// No values of a query: Drizzle prints them after "params:", and none of the
// given values (a session key, a link key, an email) shows up anywhere
export function expectNoRequestValues(text: string, values: string[]): void {
  expect(text).not.toContain("params:");
  for (const value of values) {
    expect(value.length).toBeGreaterThan(0);
    expect(text).not.toContain(value);
  }
}
