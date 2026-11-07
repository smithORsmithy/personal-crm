import { defineConfig, devices } from "@playwright/test";

// The app for e2e runs on its own port, apart from a dev server on 3000
const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Tests share one database, so they run one after another
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: {
    baseURL,
    // When a test fails: what the browser did, step by step, and how the
    // page looked (open with pnpm exec playwright show-trace)
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The production build, as on the server; the app gets an empty
    // database of its own (see e2e/start-app.ts)
    command: `pnpm build && pnpm exec tsx e2e/start-app.ts ${PORT}`,
    // 200 only when the app is up and reaches its database
    url: `${baseURL}/health`,
    // Never test a server that is already running: it may use the working database
    reuseExistingServer: false,
    // The build takes a minute or two
    timeout: 5 * 60_000,
  },
});
