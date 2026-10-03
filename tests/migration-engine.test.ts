import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MAPPINGS,
  SAMPLE_SOURCE_RECORDS,
  countEvaluations,
  evaluateBatch,
  evaluateRecord,
  validateMappings,
} from "../lib/migration-engine";

test("the seeded batch transforms deterministically and quarantines invalid records", () => {
  const results = evaluateBatch(SAMPLE_SOURCE_RECORDS, DEFAULT_MAPPINGS);
  const counts = countEvaluations(results);

  assert.equal(counts.sourceCount, 20);
  assert.equal(counts.transformedCount, 20);
  assert.equal(counts.acceptedCount, 14);
  assert.equal(counts.rejectedCount, 6);

  const normalized = results.find((record) => record.sourceKey === "C-1001");
  assert.equal(normalized?.transformed.full_name, "Rhea Patel");
  assert.equal(normalized?.transformed.email, "rhea.patel@northstar.test");
  assert.equal(normalized?.transformed.region, "WEST");
  assert.equal(normalized?.transformed.legacy_created_at, "2024-01-04");
});

test("duplicate source identifiers quarantine every conflicting record", () => {
  const duplicates = evaluateBatch(SAMPLE_SOURCE_RECORDS, DEFAULT_MAPPINGS).filter(
    (record) => record.sourceKey === "C-1007"
  );

  assert.equal(duplicates.length, 2);
  assert.ok(duplicates.every((record) => !record.accepted));
  assert.ok(
    duplicates.every((record) =>
      record.errors.some((issue) => issue.code === "DUPLICATE_SOURCE_IDENTIFIER")
    )
  );
});

test("unsupported source enum values provide field-level evidence", () => {
  const archived = evaluateRecord(
    SAMPLE_SOURCE_RECORDS.find((record) => record.legacy_customer_id === "C-1013")!,
    DEFAULT_MAPPINGS
  );

  assert.equal(archived.accepted, false);
  assert.ok(
    archived.errors.some(
      (issue) =>
        issue.field === "status" &&
        issue.code === "REQUIRED_VALUE_MISSING_OR_UNSUPPORTED"
    )
  );
});

test("plan validation rejects duplicate target mappings and incomplete plans", () => {
  const broken = [
    ...DEFAULT_MAPPINGS.slice(0, -1),
    { ...DEFAULT_MAPPINGS[0], sourceField: "customer_name" },
  ];
  const issues = validateMappings(broken);

  assert.ok(issues.some((issue) => issue.code === "DUPLICATE_TARGET_MAPPING"));
  assert.ok(issues.some((issue) => issue.code === "MISSING_REQUIRED_MAPPING"));
});
