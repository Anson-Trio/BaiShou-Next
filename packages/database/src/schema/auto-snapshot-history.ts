import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core'
import { agentSessionsTable } from './agent-sessions'

// Auto-Snapshot 历史记录表
// 追踪已快照的压缩记录,防止重复触发
export const autoSnapshotHistoryTable = sqliteTable(
  'auto_snapshot_history',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => agentSessionsTable.id, { onDelete: 'cascade' }),
    snapshotId: text('snapshot_id'),
    messageCount: integer('message_count').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
  },
  (table) => ({
    sessionIdIdx: index('auto_snapshot_history_session_id_idx').on(table.sessionId),
    snapshotIdIdx: index('auto_snapshot_history_snapshot_id_idx').on(table.snapshotId)
  })
)
