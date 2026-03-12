CREATE TABLE `cluster_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `instance_name` text NOT NULL,
  `cluster_name` text NOT NULL,
  `status` text NOT NULL DEFAULT 'running',
  `initial_prompt` text,
  `slack_channel` text,
  `slack_thread_ts` text,
  `fail_reason` text,
  `total_agent_runs` integer DEFAULT 0,
  `created_at` integer NOT NULL,
  `completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `cluster_agent_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `cluster_run_id` text NOT NULL REFERENCES cluster_runs(id),
  `role` text NOT NULL,
  `agent_index` integer NOT NULL,
  `status` text NOT NULL DEFAULT 'running',
  `label` text,
  `exit_code` integer,
  `pr_url` text,
  `volume_name` text,
  `created_at` integer NOT NULL,
  `completed_at` integer
);
