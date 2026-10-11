// Builds the Postgres connection string from environment variables.
// DATABASE_URL wins if set; otherwise the same POSTGRES_* variables
// that compose.yaml uses to start the database container.
export function getDatabaseUrl(): string {
  const { DATABASE_URL, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB } =
    process.env;

  if (DATABASE_URL) {
    return DATABASE_URL;
  }

  if (!POSTGRES_USER || !POSTGRES_PASSWORD || !POSTGRES_DB) {
    throw new Error(
      "Database settings are missing: set DATABASE_URL or POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB in .env",
    );
  }

  const host = process.env.POSTGRES_HOST || "127.0.0.1";
  const port = process.env.POSTGRES_PORT || "5432";
  const user = encodeURIComponent(POSTGRES_USER);
  const password = encodeURIComponent(POSTGRES_PASSWORD);
  const database = encodeURIComponent(POSTGRES_DB);

  return `postgres://${user}:${password}@${host}:${port}/${database}`;
}

// Loads .env for standalone scripts (drizzle-kit, seed).
// Next.js loads it on its own, so the app does not need this.
export function loadEnvFile(path = ".env"): void {
  try {
    process.loadEnvFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}
