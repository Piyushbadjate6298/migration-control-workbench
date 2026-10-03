import { createClient, type Client } from "@libsql/client";

let fallbackClient: Client | null = null;
let initialized = false;

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS activity_events (
	id text PRIMARY KEY NOT NULL,
	plan_id text NOT NULL,
	event_type text NOT NULL,
	actor text NOT NULL,
	summary text NOT NULL,
	metadata_json text NOT NULL,
	created_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_events_plan_created ON activity_events (plan_id,created_at);

CREATE TABLE IF NOT EXISTS agent_logs (
	id text PRIMARY KEY NOT NULL,
	plan_id text NOT NULL,
	tool_name text NOT NULL,
	input_json text NOT NULL,
	output_json text NOT NULL,
	decision text NOT NULL,
	created_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_logs_plan_created ON agent_logs (plan_id,created_at);

CREATE TABLE IF NOT EXISTS execution_runs (
	id text PRIMARY KEY NOT NULL,
	plan_id text NOT NULL,
	plan_version integer NOT NULL,
	action text NOT NULL,
	status text NOT NULL,
	source_count integer NOT NULL,
	transformed_count integer NOT NULL,
	accepted_count integer NOT NULL,
	rejected_count integer NOT NULL,
	duplicate_count integer DEFAULT 0 NOT NULL,
	reconciliation_json text NOT NULL,
	log_json text NOT NULL,
	error_message text,
	started_at text NOT NULL,
	completed_at text
);
CREATE INDEX IF NOT EXISTS idx_execution_runs_plan_started ON execution_runs (plan_id,started_at);
CREATE INDEX IF NOT EXISTS idx_execution_runs_action_status ON execution_runs (action,status);

CREATE TABLE IF NOT EXISTS migration_plans (
	id text PRIMARY KEY NOT NULL,
	dataset_key text NOT NULL,
	name text NOT NULL,
	version integer NOT NULL,
	status text NOT NULL,
	source_schema_json text NOT NULL,
	target_schema_json text NOT NULL,
	source_records_json text NOT NULL,
	mappings_json text NOT NULL,
	transformations_json text NOT NULL,
	risks_json text NOT NULL,
	questions_json text NOT NULL,
	approved_at text,
	approved_by text,
	created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS migration_plans_dataset_version_unique ON migration_plans (dataset_key,version);
CREATE INDEX IF NOT EXISTS idx_migration_plans_dataset_created ON migration_plans (dataset_key,created_at);

CREATE TABLE IF NOT EXISTS record_results (
	id text PRIMARY KEY NOT NULL,
	execution_id text NOT NULL,
	source_key text NOT NULL,
	stage text NOT NULL,
	outcome text NOT NULL,
	source_record_json text NOT NULL,
	transformed_record_json text NOT NULL,
	error_evidence_json text NOT NULL,
	created_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_record_results_execution_outcome ON record_results (execution_id,outcome);
CREATE INDEX IF NOT EXISTS idx_record_results_source_key ON record_results (source_key);

CREATE TABLE IF NOT EXISTS target_customers (
	id text PRIMARY KEY NOT NULL,
	external_customer_id text NOT NULL,
	full_name text NOT NULL,
	email text NOT NULL,
	phone text,
	region text NOT NULL,
	status text NOT NULL,
	segment text NOT NULL,
	legacy_created_at text NOT NULL,
	source_plan_id text NOT NULL,
	source_execution_id text NOT NULL,
	created_at text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS target_customers_external_customer_id_unique ON target_customers (external_customer_id);
CREATE INDEX IF NOT EXISTS idx_target_customers_source_plan ON target_customers (source_plan_id);
CREATE INDEX IF NOT EXISTS idx_target_customers_region_status ON target_customers (region,status);
`;

function getLibSqlFallback(): D1Database {
  if (!fallbackClient) {
    const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "file:/tmp/migration.db";
    const authToken = process.env.TURSO_AUTH_TOKEN;
    fallbackClient = createClient({ url, authToken });
  }

  const client = fallbackClient;

  const ensureTables = async () => {
    if (!initialized) {
      initialized = true;
      const statements = INIT_SQL.split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const stmt of statements) {
        await client.execute(stmt);
      }
    }
  };

  const createPreparedStatement = (query: string, params: any[] = []): any => {
    return {
      bind(...newParams: any[]) {
        return createPreparedStatement(query, newParams);
      },
      async first<T = unknown>(colName?: string): Promise<T | null> {
        await ensureTables();
        const res = await client.execute({ sql: query, args: params });
        if (res.rows.length === 0) return null;
        const row = res.rows[0];
        if (colName) {
          return (row[colName] ?? null) as T;
        }
        return row as unknown as T;
      },
      async all<T = unknown>(): Promise<{ results: T[]; success: boolean }> {
        await ensureTables();
        const res = await client.execute({ sql: query, args: params });
        return { results: res.rows as unknown as T[], success: true };
      },
      async run(): Promise<{ success: boolean }> {
        await ensureTables();
        await client.execute({ sql: query, args: params });
        return { success: true };
      },
      async raw<T = unknown>(): Promise<T[]> {
        await ensureTables();
        const res = await client.execute({ sql: query, args: params });
        return res.rows as unknown as T[];
      },
    };
  };

  return {
    prepare(query: string) {
      return createPreparedStatement(query);
    },
    async batch<T = unknown>(statements: any[]) {
      await ensureTables();
      const results: { results: T[]; success: boolean }[] = [];
      for (const stmt of statements) {
        const res = await stmt.all();
        results.push(res);
      }
      return results;
    },
    async exec(query: string) {
      await ensureTables();
      await client.execute(query);
      return { count: 1, duration: 0 };
    },
  } as unknown as D1Database;
}

export function getWorkbenchDatabase(): D1Database {
  try {
    // Dynamic require/import check for cloudflare env
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cf = typeof process !== "undefined" && process.env.NEXT_RUNTIME === "nodejs"
      ? null
      : require("cloudflare:workers");
    if (cf?.env?.DB) {
      return cf.env.DB;
    }
  } catch {
    // cloudflare:workers not available
  }

  return getLibSqlFallback();
}
