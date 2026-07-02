-- Auto-Snapshot 历史记录表
-- 追踪已快照的压缩记录,防止重复触发
CREATE TABLE `auto_snapshot_history` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `snapshot_id` text,
  `message_count` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `agent_sessions`(`id`) ON DELETE cascade
);

-- 索引优化查询性能
CREATE INDEX `idx_auto_snapshot_session` ON `auto_snapshot_history` (`session_id`);
CREATE INDEX `idx_auto_snapshot_snapshot` ON `auto_snapshot_history` (`snapshot_id`);
CREATE INDEX `idx_auto_snapshot_created` ON `auto_snapshot_history` (`created_at` DESC);
