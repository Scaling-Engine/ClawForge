CREATE TABLE `billing_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_name` text NOT NULL,
	`limit_type` text NOT NULL,
	`limit_value` real NOT NULL,
	`warning_sent_period` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`instance_name` text NOT NULL,
	`event_type` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`duration_seconds` integer,
	`period_month` text NOT NULL,
	`ref_id` text,
	`created_at` integer NOT NULL
);
