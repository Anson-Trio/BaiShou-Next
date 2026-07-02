import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { AutoSnapshotService, MidwayAppendFormatter, DiaryService } from '@baishou/core'
import { ProviderFactory } from '@baishou/ai'
import {
  AutoSnapshotConfigRepository,
  AutoSnapshotHistoryRepository,
  AgentMessageRepository,
  SettingsRepository
} from '@baishou/database-desktop'
import { logger } from '@baishou/shared'

// 桌面端自动快照服务：集成 AutoSnapshotService 与桌面端数据库
// 调用方：apps/desktop/src/main/index.ts（主进程启动时初始化）
// API：start
// 架构：订阅压缩事件,自动保存对话快照到日记

export class DesktopAutoSnapshotService {
  private coreService: AutoSnapshotService

  constructor(private db: LibSQLDatabase<Record<string, never>>) {
    const diaryService = new DiaryService(db)
    const configRepo = new AutoSnapshotConfigRepository(db)
    const historyRepo = new AutoSnapshotHistoryRepository(db)
    const messageRepo = new AgentMessageRepository(db)

    // 获取 AI 提供商配置
    const settingsRepo = new SettingsRepository(db)
    const settings = settingsRepo.getSettings()

    if (!settings.aiProvider || !settings.selectedModelId) {
      throw new Error('[DesktopAutoSnapshotService] AI 提供商未配置')
    }

    // 创建 AI 提供商实例
    const provider = ProviderFactory.createProviderFromConfig(settings.aiProvider)
    const formatter = new MidwayAppendFormatter(provider, settings.selectedModelId)

    this.coreService = new AutoSnapshotService(
      diaryService,
      configRepo,
      historyRepo,
      messageRepo,
      formatter
    )
  }

  async start(): Promise<void> {
    logger.info('[DesktopAutoSnapshotService] 启动自动快照服务')
    await this.coreService.initialize()
  }
}
