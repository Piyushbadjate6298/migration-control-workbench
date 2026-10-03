CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`event_type` text NOT NULL,
	`actor` text NOT NULL,
	`summary` text NOT NULL,
	`metadata_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activity_events_plan_created` ON `activity_events` (`plan_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `agent_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`input_json` text NOT NULL,
	`output_json` text NOT NULL,
	`decision` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agent_logs_plan_created` ON `agent_logs` (`plan_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `execution_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`plan_version` integer NOT NULL,
	`action` text NOT NULL,
	`status` text NOT NULL,
	`source_count` integer NOT NULL,
	`transformed_count` integer NOT NULL,
	`accepted_count` integer NOT NULL,
	`rejected_count` integer NOT NULL,
	`duplicate_count` integer DEFAULT 0 NOT NULL,
	`reconciliation_json` text NOT NULL,
	`log_json` text NOT NULL,
	`error_message` text,
	`started_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_execution_runs_plan_started` ON `execution_runs` (`plan_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_execution_runs_action_status` ON `execution_runs` (`action`,`status`);--> statement-breakpoint
CREATE TABLE `migration_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`dataset_key` text NOT NULL,
	`name` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`source_schema_json` text NOT NULL,
	`target_schema_json` text NOT NULL,
	`source_records_json` text NOT NULL,
	`mappings_json` text NOT NULL,
	`transformations_json` text NOT NULL,
	`risks_json` text NOT NULL,
	`questions_json` text NOT NULL,
	`approved_at` text,
	`approved_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `migration_plans_dataset_version_unique` ON `migration_plans` (`dataset_key`,`version`);--> statement-breakpoint
CREATE INDEX `idx_migration_plans_dataset_created` ON `migration_plans` (`dataset_key`,`created_at`);--> statement-breakpoint
CREATE TABLE `record_results` (
	`id` text PRIMARY KEY NOT NULL,
	`execution_id` text NOT NULL,
	`source_key` text NOT NULL,
	`stage` text NOT NULL,
	`outcome` text NOT NULL,
	`source_record_json` text NOT NULL,
	`transformed_record_json` text NOT NULL,
	`error_evidence_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_record_results_execution_outcome` ON `record_results` (`execution_id`,`outcome`);--> statement-breakpoint
CREATE INDEX `idx_record_results_source_key` ON `record_results` (`source_key`);--> statement-breakpoint
CREATE TABLE `target_customers` (
	`id` text PRIMARY KEY NOT NULL,
	`external_customer_id` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`region` text NOT NULL,
	`status` text NOT NULL,
	`segment` text NOT NULL,
	`legacy_created_at` text NOT NULL,
	`source_plan_id` text NOT NULL,
	`source_execution_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `target_customers_external_customer_id_unique` ON `target_customers` (`external_customer_id`);--> statement-breakpoint
CREATE INDEX `idx_target_customers_source_plan` ON `target_customers` (`source_plan_id`);--> statement-breakpoint
CREATE INDEX `idx_target_customers_region_status` ON `target_customers` (`region`,`status`);