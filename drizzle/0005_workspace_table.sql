CREATE TABLE `code_workspaces` (
  `id` text PRIMARY KEY NOT NULL,
  `instance_name` text NOT NULL,
  `repo_slug` text NOT NULL,
  `repo_url` text NOT NULL,
  `container_id` text,
  `container_name` text,
  `volume_name` text NOT NULL,
  `feature_branch` text,
  `status` text NOT NULL DEFAULT 'creating',
  `thread_id` text,
  `last_activity_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
