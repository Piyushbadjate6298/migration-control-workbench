# Migration Control

Migration Control is a reviewer-friendly workbench for planning, validating, executing, reconciling, retrying, and rolling back a bounded customer-data migration. It is intentionally designed for a single source, a single target, and a maximum of 50 sample records so that every data decision remains inspectable.

It is an information-management and data-quality tool. It does not connect to production systems or run arbitrary user-supplied code.

## Reviewer walkthrough

1. Open the hosted application.
2. Review the generated mapping proposal, risks, and clarification questions.
3. Approve the current plan.
4. Run a dry run. The supplied sample deterministically produces 20 source records, 14 accepted records, and 6 quarantined records.
5. Review field-level rejection evidence.
6. Execute the approved plan and confirm reconciliation is balanced.
7. Retry execution to confirm target rows are not duplicated.
8. Roll back to remove the mock-target rows and retain an auditable history.

## What is implemented

- A responsive React dashboard with loading, empty, validation, success, and failure states.
- Versioned migration plans with editable field mappings and supported transformations only.
- A constrained planning agent that inspects the supplied schemas, rules, and records; it produces mappings, risks, and clarification questions with structured tool-call logs.
- Explicit human approval before a dry run or execution is allowed.
- A deterministic migration engine with required-field, format, enum, date, duplicate, and transformation validation.
- Quarantine results with source values, transformed values, and field-level error evidence.
- Mock-target execution with a unique external customer identifier, so retries cannot insert duplicate rows.
- Source/accepted/rejected/target counts and reconciliation variance.
- Rollback that removes only target records belonging to the selected execution plan.
- Persistent D1/SQLite storage for plans, approvals, executions, retries, rollbacks, audit events, and agent logs.
- Browser agent tools for reading status and requesting an approved dry run.

## Architecture

| Layer | Responsibility |
| --- | --- |
| React/Vinext interface | Human review, plan editing, approvals, evidence, and audit-history presentation |
| API route | Authorizes workflow transitions, creates plan revisions, writes audit events, and returns snapshots |
| Migration engine | Deterministic transformation, validation, quarantine classification, and counts |
| D1/SQLite | Durable migration plans, execution runs, field evidence, target rows, activity, and agent logs |
| Constrained agent workflow | Uses supplied inspection data only and records its proposed mappings and reasoning artifacts |

The default source is a small customer export. The mock target has a unique external customer identifier. Supported transformations are explicit and whitelisted: trim, lowercase, uppercase, and a guarded country-code conversion.

## Local setup

Requirements: Node 22.13 or newer and npm.

    npm ci
    npm run db:generate
    npm run build

Apply the generated D1 migration to a local worker state:

    node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_petite_hawkeye.sql

Start the local worker:

    npm start -- --port 8787

Then open http://127.0.0.1:8787.

For an iterative development server, use:

    npm run dev

## Tests and verification

Run the focused deterministic tests with:

    npm test

The test suite covers the supplied record set, duplicate quarantine, enum validation evidence, and mapping-rule validation. Type checking, linting, a production build, a local D1 migration, and the approval, dry-run, execution, retry, reconciliation, and rollback path were also exercised before deployment.

## Deployment

The application is deployed as a Cloudflare-compatible worker through Sites. Its D1 binding is named DB. The hosted environment initializes the supplied seed plan on first use; no external credentials or production database access are needed.

## Scope and limitations

- One source schema, one target schema, and at most 50 records are accepted.
- The supplied demo record set is used rather than arbitrary file uploads or database connectors.
- The agent is intentionally constrained to the provided schemas, records, transformations, and validation behavior. It cannot execute migration actions; a user must approve the plan first.
- The mock target is a D1 table, not a production database.
- Rollback is scoped to mock-target rows written by the plan.
- There are no live connectors, distributed jobs, arbitrary transformation code, or production data access.

## Security and data handling

No secrets are required for the default deployed experience. The repository contains no API keys or production credentials. Configuration names and comments only are in .env.example.
