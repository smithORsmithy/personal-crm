// The Playwright test with one addition: every browser gets its own visitor
// address in the X-Real-IP header, the one nginx sets on the server. The
// sign-in library limits opening links per address (5 a minute), and without
// this header all tests would look like one visitor.

import { randomInt } from "node:crypto";

import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
} from "@playwright/test";

export { expect };

function randomVisitorAddress(): string {
  return `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
}

export const test = base.extend({
  context: async ({ context }, provide) => {
    await context.setExtraHTTPHeaders({ "x-real-ip": randomVisitorAddress() });
    await provide(context);
  },
});

// A separate browser profile, as another person or another device: no
// cookies shared with the first one
export async function newVisitor(
  browser: Browser,
  baseURL: string | undefined,
): Promise<BrowserContext> {
  return browser.newContext({
    baseURL,
    extraHTTPHeaders: { "x-real-ip": randomVisitorAddress() },
  });
}
