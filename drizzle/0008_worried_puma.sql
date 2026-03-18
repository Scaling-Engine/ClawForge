CREATE TABLE `cluster_agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`cluster_run_id` text NOT NULL,
	`role` text NOT NULL,
	`agent_index` integer NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`label` text,
	`exit_code` integer,
	`pr_url` text,
	`volume_name` text,
	`logs` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`cluster_run_id`) REFERENCES `cluster_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cluster_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_name` text NOT NULL,
	`cluster_name` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`initial_prompt` text,
	`slack_channel` text,
	`slack_thread_ts` text,
	`fail_reason` text,
	`total_agent_runs` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `code_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_name` text NOT NULL,
	`repo_slug` text NOT NULL,
	`repo_url` text NOT NULL,
	`container_id` text,
	`container_name` text,
	`volume_name` text NOT NULL,
	`feature_branch` text,
	`status` text DEFAULT 'creating' NOT NULL,
	`thread_id` text,
	`last_activity_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `error_log` (
	`id` text PRIMARY KEY NOT NULL,
	`context` text NOT NULL,
	`severity` text NOT NULL,
	`message` text NOT NULL,
	`stack` text,
	`metadata` text,
	`instance_name` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `terminal_costs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`turn_index` integer NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`cache_creation_tokens` integer DEFAULT 0 NOT NULL,
	`estimated_usd` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `terminal_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`repo_slug` text,
	`volume_name` text,
	`cwd_path` text,
	`status` text DEFAULT 'running' NOT NULL,
	`thinking_enabled` integer DEFAULT 0 NOT NULL,
	`shell_mode` integer DEFAULT 0 NOT NULL,
	`total_cost_usd` real DEFAULT 0,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
