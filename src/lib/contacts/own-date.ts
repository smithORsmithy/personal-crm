// "Другое": how an own date is stored, the same for the card's dialog and
// the add form. The year is picked by the database clock, like the due day;
// the date counts as set at this moment, so notes count from it.

import { sql } from "drizzle-orm";

import type { Database } from "@/db/types";

import { nearestDate, type DayMonth } from "./frequency";

export async function ownDateColumns(db: Database, dayMonth: DayMonth) {
  // execute() gives untyped rows on the shared Database type
  const [{ today }] = (await db.execute(
    sql`select current_date::text as today`,
  )) as unknown as { today: string }[];
  return {
    contactFrequency: "on_date" as const,
    contactDate: nearestDate(dayMonth, today),
    contactDateSetAt: sql`now()`,
  };
}
