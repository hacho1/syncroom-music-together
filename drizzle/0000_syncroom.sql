CREATE TABLE `participants` (
	`room_code` text NOT NULL,
	`guest_id` text NOT NULL,
	`nickname` text NOT NULL,
	`role` text DEFAULT 'guest' NOT NULL,
	`color` text NOT NULL,
	`joined_at` integer NOT NULL,
	`last_seen` integer NOT NULL,
	PRIMARY KEY(`room_code`, `guest_id`),
	FOREIGN KEY (`room_code`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_participants_room_seen` ON `participants` (`room_code`,`last_seen`);--> statement-breakpoint
CREATE TABLE `playback` (
	`room_code` text PRIMARY KEY NOT NULL,
	`video_id` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`thumbnail` text,
	`requested_by` text NOT NULL,
	`duration` integer DEFAULT 178 NOT NULL,
	`playing` integer DEFAULT false NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	`position_updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`room_code`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `queue_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_code` text NOT NULL,
	`video_id` text NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`thumbnail` text,
	`requested_by` text NOT NULL,
	`requester_guest_id` text NOT NULL,
	`duration` integer DEFAULT 204 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_code`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_queue_items_room_id` ON `queue_items` (`room_code`,`id`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`host_guest_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
