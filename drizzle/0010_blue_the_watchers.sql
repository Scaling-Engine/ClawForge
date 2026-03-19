CREATE TABLE `onboarding_state` (
	`id` text PRIMARY KEY NOT NULL,
	`current_step` text DEFAULT 'github_connect' NOT NULL,
	`github_connect` text DEFAULT 'pending' NOT NULL,
	`docker_verify` text DEFAULT 'pending' NOT NULL,
	`channel_connect` text DEFAULT 'pending' NOT NULL,
	`first_job` text DEFAULT 'pending' NOT NULL,
	`completed_at` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
