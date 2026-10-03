import { env } from "cloudflare:workers";

export function getWorkbenchDatabase(): D1Database {
  if (!env.DB) {
    throw new Error(
      "The migration database is unavailable. Apply the D1 migration and confirm the DB binding before using the workbench."
    );
  }

  return env.DB;
}
