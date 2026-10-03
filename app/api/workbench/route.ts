import { getWorkbenchDatabase } from "@/db/workbench";
import {
  buildAgentProposal,
  countEvaluations,
  evaluateBatch,
  MAX_SAMPLE_SIZE,
  SAMPLE_SOURCE_RECORDS,
  SOURCE_SCHEMA,
  SUPPORTED_TRANSFORMATIONS,
  TARGET_SCHEMA,
  validateMappings,
  type AgentToolCall,
  type ClarificationQuestion,
  type FieldDefinition,
  type FieldEvidence,
  type FieldMapping,
  type MappingRisk,
  type PlanStatus,
  type RecordEvaluation,
  type SourceRecord,
  type TargetField,
  type TargetRecord,
  type Transformation,
} from "@/lib/migration-engine";

export const dynamic = "force-dynamic";

type RunAction = "DRY_RUN" | "EXECUTE" | "RETRY" | "ROLLBACK";
type RunStatus = "COMPLETED" | "FAILED";

interface PlanRow {
  id: string;
  dataset_key: string;
  name: string;
  version: number;
  status: string;
  source_schema_json: string;
  target_schema_json: string;
  source_records_json: string;
  mappings_json: string;
  transformations_json: string;
  risks_json: string;
  questions_json: string;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

interface RunRow {
  id: string;
  plan_id: string;
  plan_version: number;
  action: string;
  status: string;
  source_count: number;
  transformed_count: number;
  accepted_count: number;
  rejected_count: number;
  duplicate_count: number;
  reconciliation_json: string;
  log_json: string;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

interface EvidenceRow {
  id: string;
  execution_id: string;
  source_key: string;
  stage: string;
  outcome: string;
  source_record_json: string;
  transformed_record_json: string;
  error_evidence_json: string;
  created_at: string;
}

interface ActivityRow {
  id: string;
  plan_id: string;
  event_type: string;
  actor: string;
  summary: string;
  metadata_json: string;
  created_at: string;
}

interface AgentLogRow {
  id: string;
  plan_id: string;
  tool_name: string;
  input_json: string;
  output_json: string;
  decision: string;
  created_at: string;
}

interface MigrationPlan {
  id: string;
  datasetKey: string;
  name: string;
  version: number;
  status: PlanStatus;
  sourceSchema: FieldDefinition[];
  targetSchema: FieldDefinition[];
  sourceRecords: SourceRecord[];
  mappings: FieldMapping[];
  transformations: string[];
  risks: MappingRisk[];
  questions: ClarificationQuestion[];
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ExecutionRun {
  id: string;
  planId: string;
  planVersion: number;
  action: RunAction;
  status: RunStatus;
  sourceCount: number;
  transformedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  duplicateCount: number;
  reconciliation: Record<string, unknown>;
  logs: Array<Record<string, unknown>>;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface Evidence {
  id: string;
  executionId: string;
  sourceKey: string;
  stage: string;
  outcome: string;
  source: SourceRecord;
  transformed: TargetRecord;
  errors: FieldEvidence[];
  warnings: FieldEvidence[];
  createdAt: string;
}

const DATASET_KEY = "legacycrm-customer-to-astercrm";
const ACTOR = "Migration analyst";

function now(): string {
  return new Date().toISOString();
}

function id(): string {
  return crypto.randomUUID();
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function fromJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function toPlan(row: PlanRow): MigrationPlan {
  return {
    id: row.id,
    datasetKey: row.dataset_key,
    name: row.name,
    version: numberValue(row.version),
    status: row.status as PlanStatus,
    sourceSchema: fromJson<FieldDefinition[]>(row.source_schema_json, SOURCE_SCHEMA),
    targetSchema: fromJson<FieldDefinition[]>(row.target_schema_json, TARGET_SCHEMA),
    sourceRecords: fromJson<SourceRecord[]>(row.source_records_json, SAMPLE_SOURCE_RECORDS),
    mappings: fromJson<FieldMapping[]>(row.mappings_json, []),
    transformations: fromJson<string[]>(row.transformations_json, []),
    risks: fromJson<MappingRisk[]>(row.risks_json, []),
    questions: fromJson<ClarificationQuestion[]>(row.questions_json, []),
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRun(row: RunRow): ExecutionRun {
  return {
    id: row.id,
    planId: row.plan_id,
    planVersion: numberValue(row.plan_version),
    action: row.action as RunAction,
    status: row.status as RunStatus,
    sourceCount: numberValue(row.source_count),
    transformedCount: numberValue(row.transformed_count),
    acceptedCount: numberValue(row.accepted_count),
    rejectedCount: numberValue(row.rejected_count),
    duplicateCount: numberValue(row.duplicate_count),
    reconciliation: fromJson<Record<string, unknown>>(row.reconciliation_json, {}),
    logs: fromJson<Array<Record<string, unknown>>>(row.log_json, []),
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function toEvidence(row: EvidenceRow): Evidence {
  const details = fromJson<{ errors: FieldEvidence[]; warnings: FieldEvidence[] }>(
    row.error_evidence_json,
    { errors: [], warnings: [] }
  );

  return {
    id: row.id,
    executionId: row.execution_id,
    sourceKey: row.source_key,
    stage: row.stage,
    outcome: row.outcome,
    source: fromJson<SourceRecord>(row.source_record_json, {}),
    transformed: fromJson<TargetRecord>(row.transformed_record_json, {}),
    errors: details.errors,
    warnings: details.warnings,
    createdAt: row.created_at,
  };
}

function toActivity(row: ActivityRow) {
  return {
    id: row.id,
    planId: row.plan_id,
    eventType: row.event_type,
    actor: row.actor,
    summary: row.summary,
    metadata: fromJson<Record<string, unknown>>(row.metadata_json, {}),
    createdAt: row.created_at,
  };
}

function toAgentLog(row: AgentLogRow) {
  return {
    id: row.id,
    planId: row.plan_id,
    toolName: row.tool_name,
    input: fromJson<Record<string, unknown>>(row.input_json, {}),
    output: fromJson<Record<string, unknown>>(row.output_json, {}),
    decision: row.decision,
    createdAt: row.created_at,
  };
}

async function all<T>(db: D1Database, statement: string, values: unknown[] = []): Promise<T[]> {
  const prepared = db.prepare(statement);
  const result = values.length ? await prepared.bind(...values).all<T>() : await prepared.all<T>();
  return result.results ?? [];
}

async function first<T>(db: D1Database, statement: string, values: unknown[] = []): Promise<T | null> {
  const prepared = db.prepare(statement);
  return values.length ? await prepared.bind(...values).first<T>() : await prepared.first<T>();
}

async function insertPlan(db: D1Database, plan: MigrationPlan): Promise<void> {
  await db
    .prepare(
      "INSERT INTO migration_plans (id, dataset_key, name, version, status, source_schema_json, target_schema_json, source_records_json, mappings_json, transformations_json, risks_json, questions_json, approved_at, approved_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      plan.id,
      plan.datasetKey,
      plan.name,
      plan.version,
      plan.status,
      json(plan.sourceSchema),
      json(plan.targetSchema),
      json(plan.sourceRecords),
      json(plan.mappings),
      json(plan.transformations),
      json(plan.risks),
      json(plan.questions),
      plan.approvedAt,
      plan.approvedBy,
      plan.createdAt,
      plan.updatedAt
    )
    .run();
}

async function recordActivity(
  db: D1Database,
  planId: string,
  eventType: string,
  summary: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO activity_events (id, plan_id, event_type, actor, summary, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(id(), planId, eventType, ACTOR, summary, json(metadata), now())
    .run();
}

async function recordAgentLogs(
  db: D1Database,
  planId: string,
  calls: AgentToolCall[]
): Promise<void> {
  if (!calls.length) return;
  const createdAt = now();
  await db.batch(
    calls.map((call) =>
      db
        .prepare(
          "INSERT INTO agent_logs (id, plan_id, tool_name, input_json, output_json, decision, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(id(), planId, call.toolName, json(call.input), json(call.output), call.decision, createdAt)
    )
  );
}

async function latestPlan(db: D1Database): Promise<MigrationPlan | null> {
  const row = await first<PlanRow>(
    db,
    "SELECT * FROM migration_plans WHERE dataset_key = ? ORDER BY version DESC LIMIT 1",
    [DATASET_KEY]
  );
  return row ? toPlan(row) : null;
}

async function planById(db: D1Database, planId: string | undefined): Promise<MigrationPlan> {
  const plan = planId
    ? await first<PlanRow>(db, "SELECT * FROM migration_plans WHERE id = ?", [planId])
    : null;
  const resolved = plan ? toPlan(plan) : await latestPlan(db);
  if (!resolved) throw new Error("A migration plan is not available yet.");
  return resolved;
}

async function targetCount(db: D1Database): Promise<number> {
  const row = await first<{ count: number }>(db, "SELECT COUNT(*) AS count FROM target_customers");
  return numberValue(row?.count);
}

async function ensureSeed(db: D1Database): Promise<void> {
  const existing = await latestPlan(db);
  if (existing) return;

  const proposal = buildAgentProposal(SOURCE_SCHEMA, TARGET_SCHEMA, SAMPLE_SOURCE_RECORDS);
  const createdAt = now();
  const plan: MigrationPlan = {
    id: "plan-demo-v1",
    datasetKey: DATASET_KEY,
    name: "LegacyCRM customer migration",
    version: 1,
    status: "REVIEW_REQUIRED",
    sourceSchema: SOURCE_SCHEMA,
    targetSchema: TARGET_SCHEMA,
    sourceRecords: SAMPLE_SOURCE_RECORDS,
    mappings: proposal.mappings,
    transformations: proposal.transformations,
    risks: proposal.risks,
    questions: proposal.questions,
    approvedAt: null,
    approvedBy: null,
    createdAt,
    updatedAt: createdAt,
  };

  await insertPlan(db, plan);
  await recordAgentLogs(db, plan.id, proposal.toolCalls);
  await recordActivity(
    db,
    plan.id,
    "PLAN_PROPOSED",
    "Guardrailed mapping agent prepared version 1 for human review.",
    { version: 1, sourceRecords: plan.sourceRecords.length }
  );
}

async function createPlanRevision(
  db: D1Database,
  base: MigrationPlan,
  patch: Partial<Pick<MigrationPlan, "mappings" | "transformations" | "risks" | "questions" | "sourceRecords" | "sourceSchema">>
): Promise<MigrationPlan> {
  const row = await first<{ next_version: number }>(
    db,
    "SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM migration_plans WHERE dataset_key = ?",
    [DATASET_KEY]
  );
  const createdAt = now();
  const plan: MigrationPlan = {
    ...base,
    ...patch,
    id: id(),
    version: numberValue(row?.next_version) || base.version + 1,
    status: "REVIEW_REQUIRED",
    approvedAt: null,
    approvedBy: null,
    createdAt,
    updatedAt: createdAt,
  };
  await insertPlan(db, plan);
  return plan;
}

function assertApproved(plan: MigrationPlan): void {
  if (plan.status !== "APPROVED" && plan.status !== "EXECUTED") {
    throw new Error("Approve the current mapping plan before running a dry run or migration.");
  }
}

function targetText(record: TargetRecord, field: TargetField): string {
  const value = record[field];
  if (!value) throw new Error("Missing target value " + field + " during execution.");
  return value;
}

async function insertRun(
  db: D1Database,
  run: ExecutionRun
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO execution_runs (id, plan_id, plan_version, action, status, source_count, transformed_count, accepted_count, rejected_count, duplicate_count, reconciliation_json, log_json, error_message, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      run.id,
      run.planId,
      run.planVersion,
      run.action,
      run.status,
      run.sourceCount,
      run.transformedCount,
      run.acceptedCount,
      run.rejectedCount,
      run.duplicateCount,
      json(run.reconciliation),
      json(run.logs),
      run.errorMessage,
      run.startedAt,
      run.completedAt
    )
    .run();
}

async function storeEvidence(
  db: D1Database,
  executionId: string,
  stage: string,
  records: Array<{ evaluation: RecordEvaluation; outcome: string; errors?: FieldEvidence[] }>
): Promise<void> {
  if (!records.length) return;
  const createdAt = now();
  await db.batch(
    records.map(({ evaluation, outcome, errors }) =>
      db
        .prepare(
          "INSERT INTO record_results (id, execution_id, source_key, stage, outcome, source_record_json, transformed_record_json, error_evidence_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
          id(),
          executionId,
          evaluation.sourceKey,
          stage,
          outcome,
          json(evaluation.source),
          json(evaluation.transformed),
          json({ errors: errors ?? evaluation.errors, warnings: evaluation.warnings }),
          createdAt
        )
    )
  );
}

async function updatePlanStatus(db: D1Database, planId: string, status: PlanStatus): Promise<void> {
  await db
    .prepare("UPDATE migration_plans SET status = ?, updated_at = ? WHERE id = ?")
    .bind(status, now(), planId)
    .run();
}

async function dryRun(db: D1Database, plan: MigrationPlan): Promise<void> {
  assertApproved(plan);
  const evaluations = evaluateBatch(plan.sourceRecords, plan.mappings);
  const counts = countEvaluations(evaluations);
  const currentTargetCount = await targetCount(db);
  const executionId = id();
  const completedAt = now();
  const run: ExecutionRun = {
    id: executionId,
    planId: plan.id,
    planVersion: plan.version,
    action: "DRY_RUN",
    status: "COMPLETED",
    sourceCount: counts.sourceCount,
    transformedCount: counts.transformedCount,
    acceptedCount: counts.acceptedCount,
    rejectedCount: counts.rejectedCount,
    duplicateCount: 0,
    reconciliation: {
      sourceTotal: counts.sourceCount,
      transformed: counts.transformedCount,
      validAfterTransform: counts.acceptedCount,
      quarantined: counts.rejectedCount,
      targetBefore: currentTargetCount,
      targetAfter: currentTargetCount,
      variance: 0,
      mode: "dry_run_no_writes",
    },
    logs: [
      { level: "info", event: "dry_run_started", planId: plan.id, recordLimit: MAX_SAMPLE_SIZE },
      { level: "info", event: "records_validated", accepted: counts.acceptedCount, rejected: counts.rejectedCount },
      { level: "info", event: "dry_run_completed", writes: 0 },
    ],
    errorMessage: null,
    startedAt: completedAt,
    completedAt,
  };

  await insertRun(db, run);
  await storeEvidence(
    db,
    executionId,
    "DRY_RUN",
    evaluations.map((evaluation) => ({
      evaluation,
      outcome: evaluation.accepted ? "ACCEPTED" : "REJECTED",
    }))
  );
  await recordActivity(
    db,
    plan.id,
    "DRY_RUN_COMPLETED",
    "Deterministic dry run completed without target writes.",
    { accepted: counts.acceptedCount, rejected: counts.rejectedCount }
  );
}

async function executeMigration(db: D1Database, plan: MigrationPlan): Promise<void> {
  assertApproved(plan);
  const evaluations = evaluateBatch(plan.sourceRecords, plan.mappings);
  const valid = evaluations.filter((evaluation) => evaluation.accepted);
  const targetBefore = await targetCount(db);
  const identifiers = valid
    .map((evaluation) => evaluation.transformed.external_customer_id)
    .filter((identifier): identifier is string => Boolean(identifier));
  const placeholders = identifiers.map(() => "?").join(", ");
  const existingRows = identifiers.length
    ? await all<{ external_customer_id: string }>(
        db,
        "SELECT external_customer_id FROM target_customers WHERE external_customer_id IN (" + placeholders + ")",
        identifiers
      )
    : [];
  const existing = new Set(existingRows.map((row) => row.external_customer_id));
  const executionId = id();
  const action: RunAction = plan.status === "EXECUTED" ? "RETRY" : "EXECUTE";
  const newlyAccepted = valid.filter(
    (evaluation) => !existing.has(targetText(evaluation.transformed, "external_customer_id"))
  );
  const duplicates = valid.filter((evaluation) =>
    existing.has(targetText(evaluation.transformed, "external_customer_id"))
  );

  if (newlyAccepted.length) {
    await db.batch(
      newlyAccepted.map((evaluation) => {
        const transformed = evaluation.transformed;
        return db
          .prepare(
            "INSERT INTO target_customers (id, external_customer_id, full_name, email, phone, region, status, segment, legacy_created_at, source_plan_id, source_execution_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          )
          .bind(
            id(),
            targetText(transformed, "external_customer_id"),
            targetText(transformed, "full_name"),
            targetText(transformed, "email"),
            transformed.phone ?? null,
            targetText(transformed, "region"),
            targetText(transformed, "status"),
            targetText(transformed, "segment"),
            targetText(transformed, "legacy_created_at"),
            plan.id,
            executionId,
            now()
          );
      })
    );
  }

  const duplicateError = (evaluation: RecordEvaluation): FieldEvidence[] => [
    {
      field: "external_customer_id",
      code: "ALREADY_MIGRATED",
      message: "Identifier " + (evaluation.transformed.external_customer_id ?? evaluation.sourceKey) + " already exists in the target; retry created no duplicate.",
      value: evaluation.transformed.external_customer_id,
    },
  ];

  await storeEvidence(db, executionId, action, [
    ...evaluations
      .filter((evaluation) => !evaluation.accepted)
      .map((evaluation) => ({ evaluation, outcome: "REJECTED" })),
    ...newlyAccepted.map((evaluation) => ({ evaluation, outcome: "ACCEPTED" })),
    ...duplicates.map((evaluation) => ({
      evaluation,
      outcome: "DUPLICATE",
      errors: duplicateError(evaluation),
    })),
  ]);

  const targetAfter = await targetCount(db);
  const completedAt = now();
  const run: ExecutionRun = {
    id: executionId,
    planId: plan.id,
    planVersion: plan.version,
    action,
    status: "COMPLETED",
    sourceCount: evaluations.length,
    transformedCount: evaluations.length,
    acceptedCount: newlyAccepted.length,
    rejectedCount: evaluations.filter((evaluation) => !evaluation.accepted).length,
    duplicateCount: duplicates.length,
    reconciliation: {
      sourceTotal: evaluations.length,
      validSourceRecords: valid.length,
      inserted: newlyAccepted.length,
      quarantined: evaluations.filter((evaluation) => !evaluation.accepted).length,
      skippedDuplicates: duplicates.length,
      targetBefore,
      targetAfter,
      expectedTargetAfter: targetBefore + newlyAccepted.length,
      variance: targetAfter - (targetBefore + newlyAccepted.length),
      idempotent: action === "RETRY",
    },
    logs: [
      { level: "info", event: "execution_started", action, planId: plan.id },
      { level: "info", event: "deduplication_checked", existingTargetIdentifiers: duplicates.length },
      { level: "info", event: "target_write_completed", inserted: newlyAccepted.length, skippedDuplicates: duplicates.length },
      { level: "info", event: "reconciliation_completed", variance: targetAfter - (targetBefore + newlyAccepted.length) },
    ],
    errorMessage: null,
    startedAt: completedAt,
    completedAt,
  };

  await insertRun(db, run);
  await updatePlanStatus(db, plan.id, "EXECUTED");
  await recordActivity(
    db,
    plan.id,
    action === "RETRY" ? "MIGRATION_RETRIED" : "MIGRATION_EXECUTED",
    action === "RETRY"
      ? "Approved migration retried safely; existing target rows were not duplicated."
      : "Approved migration wrote accepted records to the mock target.",
    {
      inserted: newlyAccepted.length,
      rejected: run.rejectedCount,
      duplicates: duplicates.length,
      variance: run.reconciliation.variance,
    }
  );
}

async function rollbackMigration(db: D1Database, plan: MigrationPlan): Promise<void> {
  if (plan.status !== "EXECUTED") {
    throw new Error("Only an executed migration can be rolled back.");
  }
  const targetBefore = await targetCount(db);
  const scoped = await first<{ count: number }>(
    db,
    "SELECT COUNT(*) AS count FROM target_customers WHERE source_plan_id = ?",
    [plan.id]
  );
  const recordsRemoved = numberValue(scoped?.count);
  await db.prepare("DELETE FROM target_customers WHERE source_plan_id = ?").bind(plan.id).run();
  const targetAfter = await targetCount(db);
  const completedAt = now();
  const run: ExecutionRun = {
    id: id(),
    planId: plan.id,
    planVersion: plan.version,
    action: "ROLLBACK",
    status: "COMPLETED",
    sourceCount: 0,
    transformedCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    duplicateCount: 0,
    reconciliation: {
      recordsRemoved,
      targetBefore,
      targetAfter,
      expectedTargetAfter: targetBefore - recordsRemoved,
      variance: targetAfter - (targetBefore - recordsRemoved),
      rollbackScope: "Rows written by this plan only",
    },
    logs: [
      { level: "warning", event: "rollback_started", planId: plan.id },
      { level: "info", event: "rollback_completed", recordsRemoved, targetAfter },
    ],
    errorMessage: null,
    startedAt: completedAt,
    completedAt,
  };

  await insertRun(db, run);
  await updatePlanStatus(db, plan.id, "ROLLED_BACK");
  await recordActivity(
    db,
    plan.id,
    "MIGRATION_ROLLED_BACK",
    "Removed only mock target rows written by this plan.",
    { recordsRemoved, targetBefore, targetAfter }
  );
}

function sanitizeMappings(value: unknown, plan: MigrationPlan): FieldMapping[] {
  if (!Array.isArray(value)) throw new Error("Mappings must be supplied as an array.");
  const sourceFields = new Set(plan.sourceSchema.map((field) => field.name));
  const targetFields = new Set(plan.targetSchema.map((field) => field.name));
  const transformations = new Set(SUPPORTED_TRANSFORMATIONS.map((item) => item.value));
  const requiredTargets = new Set(plan.targetSchema.filter((field) => field.required).map((field) => field.name));

  return value.slice(0, 16).map((item) => {
    const candidate = item as Partial<FieldMapping>;
    const sourceField = typeof candidate.sourceField === "string" ? candidate.sourceField : "";
    const targetField = typeof candidate.targetField === "string" ? candidate.targetField : "";
    const transformation = typeof candidate.transformation === "string" ? candidate.transformation : "trim";
    if (!sourceFields.has(sourceField)) throw new Error("Unknown source field: " + sourceField);
    if (!targetFields.has(targetField)) throw new Error("Unknown target field: " + targetField);
    if (!transformations.has(transformation as Transformation)) {
      throw new Error("Unsupported transformation: " + transformation);
    }
    const previous = plan.mappings.find((mapping) => mapping.targetField === targetField);
    return {
      sourceField,
      targetField: targetField as TargetField,
      transformation: transformation as Transformation,
      required: requiredTargets.has(targetField),
      confidence:
        candidate.confidence === "high" || candidate.confidence === "low" || candidate.confidence === "medium"
          ? candidate.confidence
          : "medium",
      rationale:
        typeof candidate.rationale === "string" && candidate.rationale.trim()
          ? candidate.rationale.trim()
          : previous?.rationale ?? "Reviewer edited this mapping.",
    };
  });
}

async function snapshot(db: D1Database) {
  await ensureSeed(db);
  const current = await latestPlan(db);
  if (!current) throw new Error("Unable to initialize the migration plan.");

  const planRows = await all<PlanRow>(
    db,
    "SELECT * FROM migration_plans WHERE dataset_key = ? ORDER BY version DESC",
    [DATASET_KEY]
  );
  const plans = planRows.map(toPlan);
  const runRows = await all<RunRow>(
    db,
    "SELECT * FROM execution_runs WHERE plan_id = ? ORDER BY started_at DESC LIMIT 16",
    [current.id]
  );
  const runs = runRows.map(toRun);
  const latestDryRun = runs.find((run) => run.action === "DRY_RUN") ?? null;
  const lastExecution = runs.find((run) => run.action === "EXECUTE" || run.action === "RETRY") ?? null;
  const evidenceRun = latestDryRun ?? lastExecution ?? null;
  const evidenceRows = evidenceRun
    ? await all<EvidenceRow>(
        db,
        "SELECT * FROM record_results WHERE execution_id = ? ORDER BY outcome ASC, source_key ASC LIMIT 50",
        [evidenceRun.id]
      )
    : [];
  const activities = (
    await all<ActivityRow>(
      db,
      "SELECT * FROM activity_events WHERE plan_id = ? ORDER BY created_at DESC LIMIT 20",
      [current.id]
    )
  ).map(toActivity);
  const agentLogs = (
    await all<AgentLogRow>(
      db,
      "SELECT * FROM agent_logs WHERE plan_id = ? ORDER BY created_at ASC LIMIT 20",
      [current.id]
    )
  ).map(toAgentLog);
  const predicted = countEvaluations(evaluateBatch(current.sourceRecords, current.mappings));
  const mappingIssues = validateMappings(current.mappings);
  const currentTargetCount = await targetCount(db);

  return {
    generatedAt: now(),
    workspace: {
      title: "Migration Control",
      datasetName: "LegacyCRM customers to AsterCRM",
      maximumSampleSize: MAX_SAMPLE_SIZE,
      sampleSize: current.sourceRecords.length,
      agentPolicy: "The mapping agent can inspect source schema, target schema, sample records, and validation results. It cannot execute a migration.",
    },
    currentPlan: {
      ...current,
      mappingIssues,
      predicted,
    },
    planVersions: plans.map((plan) => ({
      id: plan.id,
      version: plan.version,
      status: plan.status,
      createdAt: plan.createdAt,
      approvedAt: plan.approvedAt,
    })),
    sourcePreview: current.sourceRecords.slice(0, 6),
    targetCount: currentTargetCount,
    latestDryRun,
    lastExecution,
    runs,
    evidence: evidenceRows.map(toEvidence),
    activities,
    agentLogs,
    supportedTransformations: SUPPORTED_TRANSFORMATIONS,
  };
}

export async function GET() {
  try {
    return Response.json(await snapshot(getWorkbenchDatabase()));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load the migration workbench." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      planId?: string;
      payload?: Record<string, unknown>;
    };
    const db = getWorkbenchDatabase();
    await ensureSeed(db);
    const plan = await planById(db, body.planId);
    let message = "Workspace refreshed.";

    switch (body.action) {
      case "run_agent": {
        const proposal = buildAgentProposal(plan.sourceSchema, plan.targetSchema, plan.sourceRecords);
        const revision = await createPlanRevision(db, plan, {
          mappings: proposal.mappings,
          transformations: proposal.transformations,
          risks: proposal.risks,
          questions: proposal.questions,
        });
        await recordAgentLogs(db, revision.id, proposal.toolCalls);
        await recordActivity(
          db,
          revision.id,
          "PLAN_PROPOSED",
          "Guardrailed mapping agent created a new review-required plan version.",
          { basedOnVersion: plan.version, newVersion: revision.version }
        );
        message = "Agent proposal created as version " + revision.version + ". Review and approve it before execution.";
        break;
      }
      case "save_mappings": {
        const mappings = sanitizeMappings(body.payload?.mappings, plan);
        const revision = await createPlanRevision(db, plan, {
          mappings,
          transformations: [...new Set(mappings.map((mapping) => mapping.transformation))],
        });
        await recordActivity(
          db,
          revision.id,
          "PLAN_EDITED",
          "Reviewer saved mapping edits as a new review-required plan version.",
          { basedOnVersion: plan.version, newVersion: revision.version, mappingCount: mappings.length }
        );
        message = "Mapping edits are saved in version " + revision.version + ". Approval is required again.";
        break;
      }
      case "approve_plan": {
        if (plan.status === "EXECUTED") throw new Error("Create a new plan version before approving further changes.");
        const issues = validateMappings(plan.mappings);
        if (issues.length) {
          throw new Error("Fix mapping validation issues before approval: " + issues.map((issue) => issue.code).join(", "));
        }
        await db
          .prepare(
            "UPDATE migration_plans SET status = ?, approved_at = ?, approved_by = ?, updated_at = ? WHERE id = ?"
          )
          .bind("APPROVED", now(), ACTOR, now(), plan.id)
          .run();
        await recordActivity(
          db,
          plan.id,
          "PLAN_APPROVED",
          "Human approval recorded. Dry run and execution are now available.",
          { version: plan.version }
        );
        message = "Plan approved. You can run the deterministic dry run or execute the mock migration.";
        break;
      }
      case "dry_run":
        await dryRun(db, plan);
        message = "Dry run completed. No target records were written.";
        break;
      case "execute":
        await executeMigration(db, plan);
        message =
          plan.status === "EXECUTED"
            ? "Retry completed safely. Existing target records were not duplicated."
            : "Approved migration executed and reconciliation was recorded.";
        break;
      case "rollback":
        await rollbackMigration(db, plan);
        message = "Mock migration rolled back. Only rows written by this plan were removed.";
        break;
      default:
        throw new Error("Unsupported workbench action.");
    }

    return Response.json({ message, snapshot: await snapshot(db) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "The requested action could not be completed." },
      { status: 400 }
    );
  }
}
