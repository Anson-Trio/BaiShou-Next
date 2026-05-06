--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `memory_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL UNIQUE,
	`parent_id` integer,
	FOREIGN KEY (`parent_id`) REFERENCES `memory_tags`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `memory_tag_relations` (
	`memory_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY (`memory_id`, `tag_id`),
	FOREIGN KEY (`memory_id`) REFERENCES `memory_embeddings`(`id`) ON DELETE CASCADE,
	FOREIGN KEY (`tag_id`) REFERENCES `memory_tags`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `memory_tag_relations_memory_idx` ON `memory_tag_relations` (`memory_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `memory_tag_relations_tag_idx` ON `memory_tag_relations` (`tag_id`);
