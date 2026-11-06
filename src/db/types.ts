import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type * as schema from "./schema";

// The app's database or a transaction: code that takes this can run on
// either, which is how tests roll their changes back
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
