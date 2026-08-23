CREATE TABLE `api_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL
);
