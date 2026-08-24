ALTER TABLE `rooms` ADD `visibility` text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `max_participants` integer DEFAULT 50 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_rooms_visibility_updated` ON `rooms` (`visibility`,`updated_at`);