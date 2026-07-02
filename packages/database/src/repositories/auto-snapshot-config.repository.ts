import { eq } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { systemSettingsTable } from '../schema/system-settings'

// Auto-Snapshot 配置仓储：读写自动快照配置
// 调用方：packages/core/src/diary/auto-snapshot.service.ts
// API：get、update
// 数据结构：使用 system_settings 表,key='auto_snapshot_config'

export interface AutoSnapshotConfig {
  enabled: boolean
  minMessageCount: number
  triggerThreshold: number
}

const DEFAULT_CONFIG: AutoSnapshotConfig = {
  enabled: true,
  minMessageCount: 5,
  triggerThreshold: 1
}

const CONFIG_KEY = 'auto_snapshot_config'

export class AutoSnapshotConfigRepository {
  constructor(private db: LibSQLDatabase<Record<string, never>>) {}

  async get(): Promise<AutoSnapshotConfig> {
    const result = await this.db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, CONFIG_KEY))
      .limit(1)
      .all()

    if (result.length === 0) {
      return DEFAULT_CONFIG
    }

    try {
      return JSON.parse(result[0]?.value ?? '{}') as AutoSnapshotConfig
    } catch {
      return DEFAULT_CONFIG
    }
  }

  async update(config: AutoSnapshotConfig): Promise<void> {
    const now = new Date()
    const value = JSON.stringify(config)

    const existing = await this.db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, CONFIG_KEY))
      .limit(1)
      .all()

    if (existing.length === 0) {
      await this.db.insert(systemSettingsTable).values({
        key: CONFIG_KEY,
        value,
        updatedAt: now
      })
    } else {
      await this.db
        .update(systemSettingsTable)
        .set({ value, updatedAt: now })
        .where(eq(systemSettingsTable.key, CONFIG_KEY))
        .run()
    }
  }
}
