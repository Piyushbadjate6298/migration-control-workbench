import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { getWorkbenchDatabase } from "./workbench";

export function getDb() {
  const db = getWorkbenchDatabase();
  return drizzle(db, { schema });
}
