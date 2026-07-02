import type { EmbeddedMigrations } from './migration.service'

/**
 * Agent DB 迁移（内嵌，供 Expo / React Native 使用，不依赖文件系统读取 drizzle 目录）
 * 由 scripts/sync-embedded-agent-migrations.mjs 根据 apps/desktop/resources/database/drizzle 自动生成
 */
export const EMBEDDED_AGENT_MIGRATIONS: EmbeddedMigrations = {
  journal: {
    version: '7',
    dialect: 'sqlite',
    entries: [
      {
        idx: 0,
        version: '6',
        when: 1781510528245,
        tag: '0000_agent_schema',
        breakpoints: true
      },
      {
        idx: 1,
        version: '6',
        when: 1782822702200,
        tag: '0001_eminent_purple_man',
        breakpoints: true
      },
      {
        idx: 2,
        version: '6',
        when: 1783075680000,
        tag: '0002_auto_snapshot_history',
        breakpoints: true
      }
    ]
  },
  sqlByTag: {
    '0000_agent_schema': `CREATE TABLE \`agent_assistants\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`name\` text NOT NULL,
	\`emoji\` text,
	\`description\` text DEFAULT '',
	\`avatar_path\` text,
	\`system_prompt\` text DEFAULT '',
	\`is_default\` integer DEFAULT false NOT NULL,
	\`is_pinned\` integer DEFAULT false NOT NULL,
	\`context_window\` integer DEFAULT 20 NOT NULL,
	\`provider_id\` text,
	\`model_id\` text,
	\`compress_token_threshold\` integer DEFAULT 60000 NOT NULL,
	\`compress_keep_turns\` integer DEFAULT 3 NOT NULL,
	\`compress_model_context_window\` integer,
	\`compress_preserve_recent_tokens\` integer,
	\`compress_system_prompt\` text,
	\`assistant_kind\` text DEFAULT 'companion' NOT NULL,
	\`sort_order\` integer DEFAULT 0 NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`updated_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`agent_sessions\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`title\` text DEFAULT '新对话' NOT NULL,
	\`vault_name\` text NOT NULL,
	\`assistant_id\` text,
	\`is_pinned\` integer DEFAULT false NOT NULL,
	\`system_prompt\` text,
	\`provider_id\` text NOT NULL,
	\`model_id\` text NOT NULL,
	\`total_input_tokens\` integer DEFAULT 0 NOT NULL,
	\`total_output_tokens\` integer DEFAULT 0 NOT NULL,
	\`total_cache_read_input_tokens\` integer DEFAULT 0 NOT NULL,
	\`total_cache_write_input_tokens\` integer DEFAULT 0 NOT NULL,
	\`total_cost_micros\` integer DEFAULT 0 NOT NULL,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	\`updated_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`agent_messages\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`session_id\` text NOT NULL,
	\`role\` text NOT NULL,
	\`is_summary\` integer DEFAULT false NOT NULL,
	\`ask_id\` text,
	\`provider_id\` text,
	\`model_id\` text,
	\`order_index\` integer NOT NULL,
	\`input_tokens\` integer,
	\`output_tokens\` integer,
	\`cache_read_input_tokens\` integer,
	\`cache_write_input_tokens\` integer,
	\`cost_micros\` integer,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (\`session_id\`) REFERENCES \`agent_sessions\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE \`agent_parts\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`message_id\` text NOT NULL,
	\`session_id\` text NOT NULL,
	\`type\` text NOT NULL,
	\`data\` text,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (\`message_id\`) REFERENCES \`agent_messages\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE \`compression_snapshots\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`session_id\` text NOT NULL,
	\`summary_text\` text NOT NULL,
	\`covered_up_to_message_id\` text NOT NULL,
	\`tail_start_message_id\` text,
	\`message_count\` integer NOT NULL,
	\`token_count\` integer,
	\`created_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`summaries\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`type\` text NOT NULL,
	\`start_date\` integer NOT NULL,
	\`end_date\` integer NOT NULL,
	\`content\` text NOT NULL,
	\`source_ids\` text,
	\`generated_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX \`summaries_type_start_date_end_date_unique\` ON \`summaries\` (\`type\`,\`start_date\`,\`end_date\`);
--> statement-breakpoint
CREATE TABLE \`system_settings\` (
	\`key\` text PRIMARY KEY NOT NULL,
	\`value\` text NOT NULL,
	\`updated_at\` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`memory_embeddings\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`embedding_id\` text NOT NULL,
	\`source_type\` text NOT NULL,
	\`source_id\` text NOT NULL,
	\`group_id\` text NOT NULL,
	\`chunk_index\` integer DEFAULT 0 NOT NULL,
	\`chunk_text\` text NOT NULL,
	\`metadata_json\` text DEFAULT '{}' NOT NULL,
	\`embedding\` blob NOT NULL,
	\`dimension\` integer NOT NULL,
	\`model_id\` text DEFAULT '' NOT NULL,
	\`created_at\` integer NOT NULL,
	\`source_created_at\` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX \`memory_embeddings_embedding_id_unique\` ON \`memory_embeddings\` (\`embedding_id\`);`,
    '0001_eminent_purple_man': `ALTER TABLE \`agent_assistants\` ADD \`assistant_kind\` text DEFAULT 'companion' NOT NULL;--> statement-breakpoint
ALTER TABLE \`agent_messages\` ADD \`is_proactive\` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE \`agent_messages\` ADD \`trigger_id\` text;--> statement-breakpoint
ALTER TABLE \`agent_messages\` ADD \`trigger_type\` text;--> statement-breakpoint
ALTER TABLE \`agent_messages\` ADD \`user_feedback\` text;`,
    '0002_auto_snapshot_history': `-- Auto-Snapshot 历史记录表
-- 追踪已快照的压缩记录,防止重复触发
CREATE TABLE \`auto_snapshot_history\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`session_id\` text NOT NULL,
  \`snapshot_id\` text,
  \`message_count\` integer NOT NULL,
  \`created_at\` integer NOT NULL,
  FOREIGN KEY (\`session_id\`) REFERENCES \`agent_sessions\`(\`id\`) ON DELETE cascade
);

-- 索引优化查询性能
CREATE INDEX \`idx_auto_snapshot_session\` ON \`auto_snapshot_history\` (\`session_id\`);
CREATE INDEX \`idx_auto_snapshot_snapshot\` ON \`auto_snapshot_history\` (\`snapshot_id\`);
CREATE INDEX \`idx_auto_snapshot_created\` ON \`auto_snapshot_history\` (\`created_at\` DESC);`
  }
}
