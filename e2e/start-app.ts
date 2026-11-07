// Starts the built app for the e2e tests. Playwright runs it before the
// tests and stops it after them (see playwright.config.ts).
// The app works with its own database "<working name>_e2e_test": it is
// dropped, created again and migrated, so every run starts clean and the
// working data is never touched.
// Usage: tsx e2e/start-app.ts <port>, after pnpm build.

import { spawn } from "node:child_process";
import { cpSync } from "node:fs";

import { recreateDatabase } from "../test/recreate-db";
import { getE2eDatabaseUrls } from "../test/test-url";

async function main() {
  const port = Number(process.argv[2]);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("Usage: tsx e2e/start-app.ts <port>");
  }

  const urls = getE2eDatabaseUrls();
  await recreateDatabase(urls);

  // The same server as in the Docker image, with the static files next to
  // it: the Dockerfile copies them the same way
  cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });

  const app = spawn(process.execPath, [".next/standalone/server.js"], {
    stdio: "inherit",
    env: {
      ...process.env,
      // Wins over the settings in .env (see src/db/url.ts)
      DATABASE_URL: urls.testUrl,
      PORT: String(port),
      // Reachable only from this computer
      HOSTNAME: "127.0.0.1",
    },
  });
  app.on("exit", (code) => process.exit(code ?? 1));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
