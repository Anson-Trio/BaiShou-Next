import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { autoSnapshotHistoryTable } from '../schema/auto-snapshot-history'
import { nanoid } from 'nanoid'

// Auto-Snapshot 历史记录仓储：追踪已快照的压缩记录
// 调用方：packages/core/src/diary/auto-snapshot.service.ts
// API：create、exists、findBySessionId
// 数据结构：操作 auto_snapshot_history 表

export interface CreateAutoSnapshotHistoryInput {
  sessionId: string
  snapshotId?: string
  messageCount: number
}

export class AutoSnapshotHistoryRepository {
  constructor(private db: LibSQLDatabase<Record<string, never>>) {}

  async create(input: CreateAutoSnapshotHistoryInput): Promise<string> {
    const id = nanoid()
    const now = new Date()

    await this.db.insert(autoSnapshotHistoryTable).values({
      id,
      sessionId: input.sessionId,
      snapshotId: input.snapshotId ?? null,
      messageCount: input.messageCount,
      createdAt: now
    })

    return id
  }

  async exists(snapshotId: string): Promise<boolean> {
    const result = await this.db
      .select()
      .from(autoSnapshotHistoryTable)
      .where(eq(autoSnapshotHistoryTable.snapshotId, snapshotId))
      .limit(1)
      .all()

    return result.length > 0
  }

  async findBySessionId(sessionId: string) {
    return this.db
      .select()
      .from(autoSnapshotHistoryTable)
      .where(eq(autoSnapshotHistoryTable.sessionId, sessionId))
      .all()
  }
}
