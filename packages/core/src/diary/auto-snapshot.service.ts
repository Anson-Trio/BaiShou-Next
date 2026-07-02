import { onCompressionLifecycle } from '@baishou/ai'
import type { DiaryService } from './diary.service'
import type {
  AutoSnapshotConfigRepository,
  AutoSnapshotHistoryRepository,
  AgentMessageRepository
} from '@baishou/database'
import { logger } from '@baishou/shared'
import type { MidwayAppendFormatter } from './midway-append-formatter.service'

// 自动快照服务：在对话压缩时自动保存对话内容到日记
// 调用方：apps/desktop/src/main/services/auto-snapshot.service.ts（桌面端集成）
// API：initialize
// 架构：订阅 onCompressionLifecycle 的 'finish' 事件,提取消息并追加到日记

export class AutoSnapshotService {
  constructor(
    private readonly diaryService: DiaryService,
    private readonly configRepo: AutoSnapshotConfigRepository,
    private readonly historyRepo: AutoSnapshotHistoryRepository,
    private readonly messageRepo: AgentMessageRepository,
    private readonly formatter: MidwayAppendFormatter
  ) {}

  async initialize(): Promise<void> {
    logger.info('[AutoSnapshotService] 初始化自动快照服务')

    onCompressionLifecycle(async (event) => {
      if (event.type !== 'finish' || !event.ok) {
        return
      }

      try {
        await this.handleCompressionFinish(event)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('[AutoSnapshotService] 快照创建失败', new Error(errorMessage))
      }
    })
  }

  private async handleCompressionFinish(event: {
    type: 'finish'
    sessionId: string
    phase: 'auto' | 'manual'
    ok: boolean
    coveredUpToMessageId?: string
    snapshotId?: number
  }): Promise<void> {
    const config = await this.configRepo.get()

    if (!config.enabled) {
      logger.debug('[AutoSnapshotService] 自动快照已禁用')
      return
    }

    // 防重复检查
    const snapshotIdStr = event.snapshotId?.toString()
    if (snapshotIdStr && (await this.historyRepo.exists(snapshotIdStr))) {
      logger.debug('[AutoSnapshotService] 快照已存在,跳过', { snapshotId: snapshotIdStr })
      return
    }

    // 提取消息
    const messages = await this.extractMessages(event.sessionId, event.coveredUpToMessageId)

    if (messages.length < config.minMessageCount) {
      logger.debug('[AutoSnapshotService] 消息数不足,跳过快照', {
        count: messages.length,
        threshold: config.minMessageCount
      })
      return
    }

    // 生成快照内容
    const content = await this.formatSnapshot(messages)

    // 追加到今天的日记
    const today = new Date()
    try {
      await this.diaryService.save(null, {
        date: today,
        content
      })

      logger.info('[AutoSnapshotService] 快照已保存到日记', {
        sessionId: event.sessionId,
        messageCount: messages.length
      })

      // 记录历史
      await this.historyRepo.create({
        sessionId: event.sessionId,
        snapshotId: event.snapshotId?.toString(),
        messageCount: messages.length
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('[AutoSnapshotService] 保存快照到日记失败', new Error(errorMessage))
      throw error
    }
  }

  private async extractMessages(
    sessionId: string,
    coveredUpToMessageId?: string
  ): Promise<Array<{ role: string; content: string }>> {
    const allMessages = await this.messageRepo.findBySessionId(sessionId)

    // 筛选需要的消息
    let targetMessages = allMessages
    if (coveredUpToMessageId) {
      const coverIndex = allMessages.findIndex((m) => m.id === coveredUpToMessageId)
      if (coverIndex !== -1) {
        targetMessages = allMessages.slice(0, coverIndex + 1)
      }
    }

    // 提取每条消息的 parts 并拼接 text 类型的内容
    const result: Array<{ role: string; content: string }> = []
    for (const msg of targetMessages) {
      const parts = await this.messageRepo.getPartsByMessageId(msg.id)
      const textParts = parts.filter((p) => p.type === 'text')
      const content = textParts
        .map((p) => (typeof p.data === 'object' && 'text' in p.data ? p.data.text : String(p.data)))
        .join('\n')

      if (content.trim()) {
        result.push({ role: msg.role, content })
      }
    }

    return result
  }

  private async formatSnapshot(
    messages: Array<{ role: string; content: string }>
  ): Promise<string> {
    const now = new Date()
    return await this.formatter.formatMessages(messages, now)
  }
}
