--> statement-breakpoint
ALTER TABLE `memory_embeddings` ADD COLUMN `title` text NOT NULL DEFAULT('');
--> statement-breakpoint
ALTER TABLE `memory_embeddings` ADD COLUMN `content` text NOT NULL DEFAULT('');
--> statement-breakpoint
ALTER TABLE `memory_embeddings` ADD COLUMN `content_type` text NOT NULL DEFAULT('text/plain');
--> statement-breakpoint
ALTER TABLE `memory_embeddings` ADD COLUMN `source` text NOT NULL DEFAULT('unknown');
--> statement-breakpoint
ALTER TABLE `memory_embeddings` ADD COLUMN `importance` real NOT NULL DEFAULT(0.5);
--> statement-breakpoint
ALTER TABLE `memory_embeddings` ADD COLUMN `credibility` real NOT NULL DEFAULT(0.5);
--> statement-breakpoint
ALTER TABLE `memory_embeddings` ADD COLUMN `folder_path` text;
--> statement-breakpoint
ALTER TABLE `memory_embeddings` ADD COLUMN `tags` text NOT NULL DEFAULT('');
--> statement-breakpoint
ALTER TABLE `memory_embeddings` ADD COLUMN `last_accessed_at` integer NOT NULL DEFAULT (unixepoch());
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `memory_embeddings_folder_path_idx` ON `memory_embeddings` (`folder_path`);
