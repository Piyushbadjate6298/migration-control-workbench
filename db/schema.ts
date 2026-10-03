import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const migrationPlans = sqliteTable(
  "migration_plans",
  {
    id: text("id").primaryKey(),
    datasetKey: text("dataset_key").notNull(),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    status: text("status").notNull(),
    sourceSchemaJson: text("source_schema_json").notNull(),
    targetSchemaJson: text("target_schema_json").notNull(),
    sourceRecordsJson: text("source_records_json").notNull(),
    mappingsJson: text("mappings_json").notNull(),
    transformationsJson: text("transformations_json").notNull(),
    risksJson: text("risks_json").notNull(),
    questionsJson: text("questions_json").notNull(),
    approvedAt: text("approved_at"),
    approvedBy: text("approved_by"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("migration_plans_dataset_version_unique").on(
      table.datasetKey,
      table.version
    ),
    index("idx_migration_plans_dataset_created").on(table.datasetKey, table.createdAt),
  ]
);

export const executionRuns = sqliteTable(
  "execution_runs",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id").notNull(),
    planVersion: integer("plan_version").notNull(),
    action: text("action").notNull(),
    status: text("status").notNull(),
    sourceCount: integer("source_count").notNull(),
    transformedCount: integer("transformed_count").notNull(),
    acceptedCount: integer("accepted_count").notNull(),
    rejectedCount: integer("rejected_count").notNull(),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    reconciliationJson: text("reconciliation_json").notNull(),
    logJson: text("log_json").notNull(),
    errorMessage: text("error_message"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("idx_execution_runs_plan_started").on(table.planId, table.startedAt),
    index("idx_execution_runs_action_status").on(table.action, table.status),
  ]
);

export const recordResults = sqliteTable(
  "record_results",
  {
    id: text("id").primaryKey(),
    executionId: text("execution_id").notNull(),
    sourceKey: text("source_key").notNull(),
    stage: text("stage").notNull(),
    outcome: text("outcome").notNull(),
    sourceRecordJson: text("source_record_json").notNull(),
    transformedRecordJson: text("transformed_record_json").notNull(),
    errorEvidenceJson: text("error_evidence_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_record_results_execution_outcome").on(table.executionId, table.outcome),
    index("idx_record_results_source_key").on(table.sourceKey),
  ]
);

export const targetCustomers = sqliteTable(
  "target_customers",
  {
    id: text("id").primaryKey(),
    externalCustomerId: text("external_customer_id").notNull(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    region: text("region").notNull(),
    status: text("status").notNull(),
    segment: text("segment").notNull(),
    legacyCreatedAt: text("legacy_created_at").notNull(),
    sourcePlanId: text("source_plan_id").notNull(),
    sourceExecutionId: text("source_execution_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("target_customers_external_customer_id_unique").on(
      table.externalCustomerId
    ),
    index("idx_target_customers_source_plan").on(table.sourcePlanId),
    index("idx_target_customers_region_status").on(table.region, table.status),
  ]
);

export const activityEvents = sqliteTable(
  "activity_events",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id").notNull(),
    eventType: text("event_type").notNull(),
    actor: text("actor").notNull(),
    summary: text("summary").notNull(),
    metadataJson: text("metadata_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_activity_events_plan_created").on(table.planId, table.createdAt)]
);

export const agentLogs = sqliteTable(
  "agent_logs",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id").notNull(),
    toolName: text("tool_name").notNull(),
    inputJson: text("input_json").notNull(),
    outputJson: text("output_json").notNull(),
    decision: text("decision").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_agent_logs_plan_created").on(table.planId, table.createdAt)]
);
