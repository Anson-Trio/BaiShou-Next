--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `memory_actions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trigger_memory_id` integer NOT NULL,
	`target_memory_id` integer NOT NULL,
	`action_type` text NOT NULL,
	`weight` real DEFAULT 0.7 NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trigger_memory_id`) REFERENCES `memory_embeddings`(`id`) ON DELETE CASCADE,
	FOREIGN KEY (`target_memory_id`) REFERENCES `memory_embeddings`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `memory_actions_trigger_idx` ON `memory_actions` (`trigger_memory_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `memory_actions_target_idx` ON `memory_actions` (`target_memory_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `memory_actions_type_idx` ON `memory_actions` (`action_type`);
