# Agent Usage Record

## Purpose

This project uses an agentic planning step to analyze a bounded, supplied migration scenario. The workflow is deliberately constrained: it receives only the defined source schema, target schema, supported transformations, and sample records. It does not receive database credentials, production data, or arbitrary code execution capability.

## Tools used

| Tool or capability | Purpose | Guardrail |
| --- | --- | --- |
| Schema inspection | Compare the supplied source and target fields | Read-only supplied metadata |
| Transformation inspection | Select from the approved transformation list | Whitelist only; no custom code |
| Sample-record validation | Detect format, enum, date, required-field, and duplicate problems | Deterministic engine, capped at 50 rows |
| Mapping proposal | Produce field mappings, risks, and clarification questions | Proposal is review-required, not executable |
| Structured logs | Record inputs, tool calls, outputs, and outcome counts | Stored with timestamps for reviewer inspection |

## Representative planning instructions

The planner is directed to:

- Inspect only the provided source schema, target schema, transformation catalog, and sample records.
- Propose field mappings without silently discarding incompatible fields.
- Flag ambiguity, missing target coverage, incompatible enums, and data-quality risks.
- Suggest only supported transformations.
- Produce clarification questions where a safe mapping cannot be inferred.
- Prepare a review-required plan and never execute the plan itself.

## Human review boundary

The application enforces an explicit separation between proposal and execution:

1. The agent creates a new plan version in review-required status.
2. The user can edit mappings, creating another immutable revision.
3. Only a user can approve a valid revision.
4. Dry run and execution reject plans that have not been approved.
5. A user initiates execution, retry, or rollback.

## Rejected or constrained suggestions

The implementation intentionally rejects several tempting but unsafe behaviors:

- Running a migration immediately after the agent proposes mappings.
- Accepting arbitrary transformation expressions or user-supplied scripts.
- Treating a duplicate source identifier as an overwrite.
- Inserting target records a second time when a migration is retried.
- Hiding invalid records rather than preserving quarantine evidence.
- Inferring unsupported account states or invalid dates as valid values.

## Delegated work

No external agent, service, or person was delegated application decisions. The planning behavior is implemented locally so reviewers can inspect and reproduce its behavior without relying on a paid model or an external provider.

## Verification

The implementation was checked with:

    npm test
    npx tsc --noEmit
    npm run lint
    npm run build

It was also exercised against a local D1 state through the full lifecycle: seed, approve, dry run, execute, retry without duplication, reconcile, and rollback. The structured activity and agent logs make the resulting decisions and transitions auditable.

## Known limitation

The planner is a deterministic, tool-constrained workflow rather than a remote generative-model call. That choice keeps the hosted demo reliable and makes its inspection boundary, output, and safety controls reproducible. Its logged proposal format can be replaced by a provider-backed model later without changing the approval, validation, or execution controls.
