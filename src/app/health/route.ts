import { sql } from "drizzle-orm";
import { connection } from "next/server";

import { getDb } from "@/db";
import { logDbError } from "@/db/log-error";

// Health check for the deploy and for monitoring: 200 only when the app
// can reach its database. "version" is the git commit the image was built from.
export async function GET() {
  await connection();
  const version = process.env.APP_VERSION ?? "dev";
  const headers = { "Cache-Control": "no-store" };

  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ok", version }, { headers });
  } catch (error) {
    logDbError("Health check: database is unreachable", error);
    return Response.json(
      { status: "error", version },
      { status: 503, headers },
    );
  }
}
