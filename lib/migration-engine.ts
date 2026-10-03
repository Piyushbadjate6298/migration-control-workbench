export type Transformation =
  | "trim"
  | "normalize_name"
  | "trim_lowercase"
  | "normalize_phone"
  | "normalize_region"
  | "status_map"
  | "date_to_iso"
  | "normalize_segment";

export type TargetField =
  | "external_customer_id"
  | "full_name"
  | "email"
  | "phone"
  | "region"
  | "status"
  | "segment"
  | "legacy_created_at";

export type PlanStatus = "REVIEW_REQUIRED" | "APPROVED" | "EXECUTED" | "ROLLED_BACK";

export interface FieldDefinition {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface FieldMapping {
  sourceField: string;
  targetField: TargetField;
  transformation: Transformation;
  required: boolean;
  confidence: "high" | "medium" | "low";
  rationale: string;
}

export interface MappingRisk {
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  resolution: string;
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  whyItMatters: string;
  safeDefault: string;
}

export interface AgentToolCall {
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  decision: string;
}

export type SourceRecord = Record<string, unknown>;
export type TargetRecord = Partial<Record<TargetField, string>>;

export interface FieldEvidence {
  field: string;
  code: string;
  message: string;
  value?: string;
}

export interface RecordEvaluation {
  sourceKey: string;
  source: SourceRecord;
  transformed: TargetRecord;
  errors: FieldEvidence[];
  warnings: FieldEvidence[];
  accepted: boolean;
}

export interface AgentProposal {
  mappings: FieldMapping[];
  transformations: string[];
  risks: MappingRisk[];
  questions: ClarificationQuestion[];
  toolCalls: AgentToolCall[];
}

export const MAX_SAMPLE_SIZE = 50;

export const SOURCE_SCHEMA: FieldDefinition[] = [
  { name: "legacy_customer_id", type: "string", required: true, description: "Stable identifier from LegacyCRM" },
  { name: "customer_name", type: "string", required: true, description: "Customer name as captured in source" },
  { name: "email_address", type: "string", required: true, description: "Primary contact email" },
  { name: "mobile_number", type: "string", required: false, description: "Indian mobile number, inconsistently formatted" },
  { name: "state", type: "string", required: true, description: "Indian state used to derive operating region" },
  { name: "account_state", type: "string", required: true, description: "Legacy active or inactive account state" },
  { name: "joined_on", type: "string", required: true, description: "Legacy join date in DD/MM/YYYY or ISO format" },
  { name: "customer_tier", type: "string", required: true, description: "Legacy Gold, Silver, or Basic tier" },
  { name: "marketing_opt_in", type: "boolean", required: false, description: "Legacy marketing preference" },
  { name: "legacy_notes", type: "string", required: false, description: "Free-text notes not supported by target" },
];

export const TARGET_SCHEMA: FieldDefinition[] = [
  { name: "external_customer_id", type: "string", required: true, description: "Unique, immutable customer identifier" },
  { name: "full_name", type: "string", required: true, description: "Normalized customer display name" },
  { name: "email", type: "string", required: true, description: "Validated, lowercase email address" },
  { name: "phone", type: "string", required: false, description: "Normalized E.164-style Indian phone number" },
  { name: "region", type: "enum", required: true, description: "One of WEST, SOUTH, NORTH, EAST" },
  { name: "status", type: "enum", required: true, description: "One of ACTIVE, INACTIVE" },
  { name: "segment", type: "enum", required: true, description: "One of GOLD, SILVER, STANDARD" },
  { name: "legacy_created_at", type: "date", required: true, description: "ISO-8601 join date" },
];

export const SUPPORTED_TRANSFORMATIONS: Array<{
  value: Transformation;
  label: string;
  description: string;
}> = [
  { value: "trim", label: "Trim text", description: "Remove leading and trailing whitespace" },
  { value: "normalize_name", label: "Normalize name", description: "Collapse whitespace and standardize name casing" },
  { value: "trim_lowercase", label: "Lowercase email", description: "Trim and lowercase a text value" },
  { value: "normalize_phone", label: "Normalize phone", description: "Keep 10-digit Indian mobile values as +91XXXXXXXXXX" },
  { value: "normalize_region", label: "Map state to region", description: "Map supported Indian states to target region codes" },
  { value: "status_map", label: "Map account state", description: "Map active/inactive source values to target status" },
  { value: "date_to_iso", label: "Parse date to ISO", description: "Convert DD/MM/YYYY or ISO dates to YYYY-MM-DD" },
  { value: "normalize_segment", label: "Normalize segment", description: "Map Gold/Silver/Basic to target segments" },
];

export const DEFAULT_MAPPINGS: FieldMapping[] = [
  {
    sourceField: "legacy_customer_id",
    targetField: "external_customer_id",
    transformation: "trim",
    required: true,
    confidence: "high",
    rationale: "Both fields are stable customer identifiers; uniqueness is validated before target insert.",
  },
  {
    sourceField: "customer_name",
    targetField: "full_name",
    transformation: "normalize_name",
    required: true,
    confidence: "high",
    rationale: "Source names map directly after deterministic whitespace and casing normalization.",
  },
  {
    sourceField: "email_address",
    targetField: "email",
    transformation: "trim_lowercase",
    required: true,
    confidence: "high",
    rationale: "The target requires a normalized, valid primary email address.",
  },
  {
    sourceField: "mobile_number",
    targetField: "phone",
    transformation: "normalize_phone",
    required: false,
    confidence: "medium",
    rationale: "Source formatting varies, so the transformation accepts only recognizable Indian mobile values.",
  },
  {
    sourceField: "state",
    targetField: "region",
    transformation: "normalize_region",
    required: true,
    confidence: "medium",
    rationale: "The target stores operating region, not state; the supported state-to-region matrix is deterministic.",
  },
  {
    sourceField: "account_state",
    targetField: "status",
    transformation: "status_map",
    required: true,
    confidence: "high",
    rationale: "The source and target both express an account lifecycle state with a documented two-value mapping.",
  },
  {
    sourceField: "customer_tier",
    targetField: "segment",
    transformation: "normalize_segment",
    required: true,
    confidence: "high",
    rationale: "Legacy tiers map to the target segmentation enum using the approved mapping table.",
  },
  {
    sourceField: "joined_on",
    targetField: "legacy_created_at",
    transformation: "date_to_iso",
    required: true,
    confidence: "medium",
    rationale: "The target requires ISO dates while the source can contain DD/MM/YYYY or ISO values.",
  },
];

export const SAMPLE_SOURCE_RECORDS: SourceRecord[] = [
  { legacy_customer_id: "C-1001", customer_name: "rhea patel", email_address: " Rhea.Patel@northstar.test ", mobile_number: "98765 43120", state: "Maharashtra", account_state: "active", joined_on: "04/01/2024", customer_tier: "Gold", marketing_opt_in: true, legacy_notes: "Prefer email" },
  { legacy_customer_id: "C-1002", customer_name: "Arjun Mehta", email_address: "arjun.mehta@northstar.test", mobile_number: "+91-98980-11223", state: "Gujarat", account_state: "active", joined_on: "2023-11-16", customer_tier: "Silver", marketing_opt_in: false, legacy_notes: "" },
  { legacy_customer_id: "C-1003", customer_name: "Nandini Rao", email_address: "nandini.rao@northstar.test", mobile_number: "9810098123", state: "Karnataka", account_state: "inactive", joined_on: "18/02/2024", customer_tier: "Basic", marketing_opt_in: true, legacy_notes: "Reactivation requested" },
  { legacy_customer_id: "C-1004", customer_name: "Kunal Shah", email_address: "kunal.shah@northstar.test", mobile_number: "919876543210", state: "Goa", account_state: "active", joined_on: "29/09/2023", customer_tier: "Gold", marketing_opt_in: false, legacy_notes: "" },
  { legacy_customer_id: "C-1005", customer_name: "Meera Iyer", email_address: "meera.iyer@northstar.test", mobile_number: "9988776655", state: "Tamil Nadu", account_state: "active", joined_on: "2024-03-07", customer_tier: "Silver", marketing_opt_in: true, legacy_notes: "" },
  { legacy_customer_id: "C-1006", customer_name: "Dev Malhotra", email_address: "dev.malhotra@northstar.test", mobile_number: "9876543211", state: "Delhi", account_state: "active", joined_on: "11/10/2022", customer_tier: "Basic", marketing_opt_in: false, legacy_notes: "" },
  { legacy_customer_id: "C-1007", customer_name: "Sana Khan", email_address: "sana.khan@northstar.test", mobile_number: "9822045566", state: "Maharashtra", account_state: "inactive", joined_on: "2023-08-14", customer_tier: "Silver", marketing_opt_in: true, legacy_notes: "" },
  { legacy_customer_id: "C-1008", customer_name: "Ishan Bose", email_address: "ishan.bose@northstar.test", mobile_number: "9900112233", state: "West Bengal", account_state: "active", joined_on: "21/01/2024", customer_tier: "Gold", marketing_opt_in: true, legacy_notes: "" },
  { legacy_customer_id: "C-1009", customer_name: "Aditi Kulkarni", email_address: "aditi.k@northstar.test", mobile_number: "9867001234", state: "Maharashtra", account_state: "active", joined_on: "05/05/2024", customer_tier: "Basic", marketing_opt_in: false, legacy_notes: "" },
  { legacy_customer_id: "C-1010", customer_name: "Rohan Pillai", email_address: "rohan.pillai@northstar.test", mobile_number: "9847012345", state: "Karnataka", account_state: "inactive", joined_on: "16/12/2023", customer_tier: "Silver", marketing_opt_in: false, legacy_notes: "" },
  { legacy_customer_id: "C-1011", customer_name: "Tara Desai", email_address: "", mobile_number: "9898989898", state: "Gujarat", account_state: "active", joined_on: "02/04/2024", customer_tier: "Gold", marketing_opt_in: true, legacy_notes: "Missing email in legacy export" },
  { legacy_customer_id: "C-1012", customer_name: "Aman Chawla", email_address: "aman.chawla@northstar.test", mobile_number: "9998887776", state: "Delhi", account_state: "active", joined_on: "17/07/2023", customer_tier: "Basic", marketing_opt_in: false, legacy_notes: "" },
  { legacy_customer_id: "C-1013", customer_name: "Prisha Nair", email_address: "prisha.nair@northstar.test", mobile_number: "9887766554", state: "Tamil Nadu", account_state: "archived", joined_on: "13/09/2023", customer_tier: "Silver", marketing_opt_in: true, legacy_notes: "Unrecognized lifecycle value" },
  { legacy_customer_id: "C-1014", customer_name: "Kabir Sethi", email_address: "kabir.sethi@northstar.test", mobile_number: "9876548899", state: "Delhi", account_state: "active", joined_on: "2024-02-28", customer_tier: "Gold", marketing_opt_in: true, legacy_notes: "" },
  { legacy_customer_id: "C-1015", customer_name: "Vani Reddy", email_address: "vani.reddy@northstar.test", mobile_number: "9865321470", state: "Karnataka", account_state: "active", joined_on: "31/02/2024", customer_tier: "Basic", marketing_opt_in: false, legacy_notes: "Invalid date supplied by source" },
  { legacy_customer_id: "C-1016", customer_name: "Yash Verma", email_address: "yash.verma@northstar.test", mobile_number: "9811112222", state: "Delhi", account_state: "inactive", joined_on: "09/06/2023", customer_tier: "Silver", marketing_opt_in: false, legacy_notes: "" },
  { legacy_customer_id: "C-1007", customer_name: "Sana Khan duplicate", email_address: "sana.khan+duplicate@northstar.test", mobile_number: "9822045566", state: "Maharashtra", account_state: "inactive", joined_on: "14/08/2023", customer_tier: "Silver", marketing_opt_in: true, legacy_notes: "Duplicate legacy identifier" },
  { legacy_customer_id: "C-1018", customer_name: "Nisha Kapoor", email_address: "nisha.kapoor@northstar.test", mobile_number: "9000011111", state: "Atlantis", account_state: "active", joined_on: "01/01/2024", customer_tier: "Gold", marketing_opt_in: true, legacy_notes: "Unsupported region" },
  { legacy_customer_id: "C-1019", customer_name: "Harsh Jain", email_address: "harsh.jain@northstar.test", mobile_number: "9876500000", state: "Maharashtra", account_state: "active", joined_on: "20/08/2024", customer_tier: "Basic", marketing_opt_in: false, legacy_notes: "" },
  { legacy_customer_id: "C-1020", customer_name: "Leena Thomas", email_address: "leena.thomas@northstar.test", mobile_number: "9800012345", state: "Tamil Nadu", account_state: "active", joined_on: "26/02/2024", customer_tier: "Silver", marketing_opt_in: true, legacy_notes: "" },
];

const REQUIRED_TARGET_FIELDS: TargetField[] = [
  "external_customer_id",
  "full_name",
  "email",
  "region",
  "status",
  "segment",
  "legacy_created_at",
];

const ALLOWED_REGIONS = new Set(["WEST", "SOUTH", "NORTH", "EAST"]);
const ALLOWED_STATUSES = new Set(["ACTIVE", "INACTIVE"]);
const ALLOWED_SEGMENTS = new Set(["GOLD", "SILVER", "STANDARD"]);

const REGION_BY_STATE: Record<string, string> = {
  maharashtra: "WEST",
  gujarat: "WEST",
  goa: "WEST",
  karnataka: "SOUTH",
  "tamil nadu": "SOUTH",
  delhi: "NORTH",
  "west bengal": "EAST",
};

function valueAsText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function toTitleCase(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function toIsoDate(value: string): string | null {
  const cleaned = value.trim();
  const parts = cleaned.match(/^(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[/-](\d{1,2})[/-](\d{4}))$/);
  if (!parts) return null;

  const year = Number(parts[1] ?? parts[6]);
  const month = Number(parts[2] ?? parts[5]);
  const day = Number(parts[3] ?? parts[4]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return (
    year.toString().padStart(4, "0") +
    "-" +
    month.toString().padStart(2, "0") +
    "-" +
    day.toString().padStart(2, "0")
  );
}

function transformValue(value: unknown, transformation: Transformation): string {
  const source = valueAsText(value);

  switch (transformation) {
    case "trim":
      return source;
    case "normalize_name":
      return source ? toTitleCase(source) : "";
    case "trim_lowercase":
      return source.toLowerCase();
    case "normalize_phone": {
      const digits = source.replace(/\D/g, "");
      const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
      return local.length === 10 ? "+91" + local : source;
    }
    case "normalize_region":
      return REGION_BY_STATE[source.toLowerCase()] ?? "";
    case "status_map": {
      const normalized = source.toLowerCase();
      if (normalized === "active") return "ACTIVE";
      if (normalized === "inactive") return "INACTIVE";
      return "";
    }
    case "date_to_iso":
      return source ? (toIsoDate(source) ?? "") : "";
    case "normalize_segment":
      switch (source.toLowerCase()) {
        case "gold":
          return "GOLD";
        case "silver":
          return "SILVER";
        case "basic":
          return "STANDARD";
        default:
          return "";
      }
  }
}

export function validateMappings(mappings: FieldMapping[]): FieldEvidence[] {
  const issues: FieldEvidence[] = [];
  const targetSeen = new Set<string>();

  for (const mapping of mappings) {
    if (!mapping.sourceField || !mapping.targetField) {
      issues.push({
        field: "mapping",
        code: "INCOMPLETE_MAPPING",
        message: "Every mapping needs both a source and target field.",
      });
      continue;
    }
    if (targetSeen.has(mapping.targetField)) {
      issues.push({
        field: mapping.targetField,
        code: "DUPLICATE_TARGET_MAPPING",
        message: "Target field " + mapping.targetField + " is mapped more than once.",
      });
    }
    targetSeen.add(mapping.targetField);
  }

  for (const targetField of REQUIRED_TARGET_FIELDS) {
    if (!targetSeen.has(targetField)) {
      issues.push({
        field: targetField,
        code: "MISSING_REQUIRED_MAPPING",
        message: "Required target field " + targetField + " is not mapped.",
      });
    }
  }

  return issues;
}

export function evaluateRecord(record: SourceRecord, mappings: FieldMapping[]): RecordEvaluation {
  const transformed: TargetRecord = {};
  const errors: FieldEvidence[] = [];
  const warnings: FieldEvidence[] = [];

  for (const mapping of mappings) {
    const rawValue = record[mapping.sourceField];
    const value = transformValue(rawValue, mapping.transformation);
    transformed[mapping.targetField] = value;

    if (mapping.required && !value) {
      errors.push({
        field: mapping.targetField,
        code: "REQUIRED_VALUE_MISSING_OR_UNSUPPORTED",
        message: mapping.targetField + " could not be created from " + mapping.sourceField + ".",
        value: valueAsText(rawValue),
      });
    }
  }

  for (const targetField of REQUIRED_TARGET_FIELDS) {
    if (!transformed[targetField]) {
      errors.push({
        field: targetField,
        code: "REQUIRED_TARGET_VALUE_MISSING",
        message: "Required target value " + targetField + " is missing after transformation.",
      });
    }
  }

  const email = transformed.email ?? "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push({
      field: "email",
      code: "INVALID_EMAIL",
      message: "Email does not match the supported address format.",
      value: email,
    });
  }

  const phone = transformed.phone ?? "";
  if (phone && !/^\+91\d{10}$/.test(phone)) {
    warnings.push({
      field: "phone",
      code: "UNNORMALIZED_PHONE",
      message: "Phone is retained but does not match the supported Indian mobile format.",
      value: phone,
    });
  }

  if (transformed.region && !ALLOWED_REGIONS.has(transformed.region)) {
    errors.push({
      field: "region",
      code: "UNSUPPORTED_REGION",
      message: "Region is not in the supported target enum.",
      value: transformed.region,
    });
  }
  if (transformed.status && !ALLOWED_STATUSES.has(transformed.status)) {
    errors.push({
      field: "status",
      code: "UNSUPPORTED_STATUS",
      message: "Status is not in the supported target enum.",
      value: transformed.status,
    });
  }
  if (transformed.segment && !ALLOWED_SEGMENTS.has(transformed.segment)) {
    errors.push({
      field: "segment",
      code: "UNSUPPORTED_SEGMENT",
      message: "Segment is not in the supported target enum.",
      value: transformed.segment,
    });
  }

  return {
    sourceKey: valueAsText(record.legacy_customer_id) || "(missing identifier)",
    source: record,
    transformed,
    errors,
    warnings,
    accepted: errors.length === 0,
  };
}

export function evaluateBatch(records: SourceRecord[], mappings: FieldMapping[]): RecordEvaluation[] {
  const evaluated = records.slice(0, MAX_SAMPLE_SIZE).map((record) => evaluateRecord(record, mappings));
  const byIdentifier = new Map<string, RecordEvaluation[]>();

  for (const record of evaluated) {
    const identifier = record.transformed.external_customer_id?.trim();
    if (!identifier) continue;
    const matches = byIdentifier.get(identifier) ?? [];
    matches.push(record);
    byIdentifier.set(identifier, matches);
  }

  for (const [identifier, matches] of byIdentifier) {
    if (matches.length < 2) continue;
    for (const record of matches) {
      record.errors.push({
        field: "external_customer_id",
        code: "DUPLICATE_SOURCE_IDENTIFIER",
        message: "Source identifier " + identifier + " appears " + matches.length + " times and is quarantined safely.",
        value: identifier,
      });
      record.accepted = false;
    }
  }

  return evaluated;
}

export function countEvaluations(records: RecordEvaluation[]) {
  return {
    sourceCount: records.length,
    transformedCount: records.length,
    acceptedCount: records.filter((record) => record.accepted).length,
    rejectedCount: records.filter((record) => !record.accepted).length,
    warningCount: records.reduce((sum, record) => sum + record.warnings.length, 0),
  };
}

export function buildAgentProposal(
  sourceSchema: FieldDefinition[] = SOURCE_SCHEMA,
  targetSchema: FieldDefinition[] = TARGET_SCHEMA,
  sourceRecords: SourceRecord[] = SAMPLE_SOURCE_RECORDS
): AgentProposal {
  const sourceNames = sourceSchema.map((field) => field.name);
  const targetNames = targetSchema.map((field) => field.name);
  const mappings = DEFAULT_MAPPINGS.map((mapping) => ({ ...mapping }));
  const mappingIssues = validateMappings(mappings);
  const sampleResult = evaluateBatch(sourceRecords, mappings);
  const counts = countEvaluations(sampleResult);

  return {
    mappings,
    transformations: SUPPORTED_TRANSFORMATIONS.map((item) => item.value),
    risks: [
      {
        severity: "high",
        title: "Duplicate legacy identifiers",
        detail: "The sample contains a repeated legacy_customer_id. The safe execution policy is to quarantine all records sharing that identifier.",
        resolution: "Confirm whether duplicates should be merged upstream. This workbench will not guess a survivor record.",
      },
      {
        severity: "medium",
        title: "Unsupported source values",
        detail: "Unknown account states, invalid dates, and unsupported states cannot be transformed deterministically.",
        resolution: "Quarantine the record with field-level evidence and correct the source or add an approved rule.",
      },
      {
        severity: "low",
        title: "Unmapped legacy fields",
        detail: "marketing_opt_in and legacy_notes have no target field in the bounded target schema.",
        resolution: "They are intentionally excluded and reported; no hidden data loss is performed.",
      },
    ],
    questions: [
      {
        id: "duplicates",
        question: "Should duplicate legacy_customer_id records be merged, or should they remain quarantined?",
        whyItMatters: "Choosing a winner without a documented rule could overwrite customer data.",
        safeDefault: "Quarantine every duplicate identifier.",
      },
      {
        id: "opt-in",
        question: "Should marketing_opt_in be added to the target schema before migration?",
        whyItMatters: "The target cannot currently preserve this preference.",
        safeDefault: "Exclude it and record the omission in the reviewed plan.",
      },
      {
        id: "unsupported-state",
        question: "Which target region should new or unsupported states map to?",
        whyItMatters: "A guessed region would create an inaccurate operational record.",
        safeDefault: "Quarantine the affected record until a rule is approved.",
      },
    ],
    toolCalls: [
      {
        toolName: "inspect_source_schema",
        input: { allowed: true },
        output: { fields: sourceNames, recordLimit: MAX_SAMPLE_SIZE },
        decision: "Confirmed the bounded source shape and identified two fields with no target counterpart.",
      },
      {
        toolName: "inspect_target_schema",
        input: { allowed: true },
        output: { fields: targetNames, required: targetSchema.filter((field) => field.required).map((field) => field.name) },
        decision: "Matched required target fields and constrained the proposal to documented target enums.",
      },
      {
        toolName: "inspect_sample_records",
        input: { sampleSize: Math.min(sourceRecords.length, MAX_SAMPLE_SIZE) },
        output: { sourceCount: counts.sourceCount, validAfterTransform: counts.acceptedCount, quarantined: counts.rejectedCount },
        decision: "Detected invalid dates, unsupported states/lifecycle values, and duplicate source identifiers before execution.",
      },
      {
        toolName: "validate_mapping_plan",
        input: { mappingCount: mappings.length, transformations: mappings.map((mapping) => mapping.transformation) },
        output: { valid: mappingIssues.length === 0, issues: mappingIssues },
        decision: "Prepared a review-required plan; no execution tool was invoked.",
      },
    ],
  };
}
