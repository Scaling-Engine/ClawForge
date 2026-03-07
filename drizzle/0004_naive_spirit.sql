ALTER TABLE `job_origins` ADD `dispatch_method` text DEFAULT 'actions' NOT NULL;--> statement-breakpoint
ALTER TABLE `job_origins` ADD `container_id` text;--> statement-breakpoint
ALTER TABLE `job_origins` ADD `notified` integer DEFAULT 0 NOT NULL;