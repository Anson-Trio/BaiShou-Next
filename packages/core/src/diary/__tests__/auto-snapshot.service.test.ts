import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { AutoSnapshotService } from '../auto-snapshot.service'
import type { DiaryService } from '../diary.service'
import type { AutoSnapshotConfigRepository, AutoSnapshotHistoryRepository } from '@baishou/database'
import type { AgentMessageRepository } from '@baishou/database'
import type { MidwayAppendFormatter } from '../midway-append-formatter.service'

// TDD：自动快照服务测试
// 测试目标：验证压缩完成时正确快照对话内容到日记

vi.mock('@baishou/ai', () => ({
  onCompressionLifecycle: vi.fn()
}))

describe('AutoSnapshotService', () => {
  let service: AutoSnapshotService
  let mockDiaryService: Partial<DiaryService>
  let mockConfigRepo: Partial<AutoSnapshotConfigRepository>
  let mockHistoryRepo: Partial<AutoSnapshotHistoryRepository>
  let mockMessageRepo: Partial<AgentMessageRepository>
  let mockFormatter: Partial<MidwayAppendFormatter>
  let compressionHandler: any

  beforeEach(async () => {
    const { onCompressionLifecycle } = await import('@baishou/ai')
    vi.mocked(onCompressionLifecycle).mockImplementation((handler) => {
      compressionHandler = handler
      return () => {} // 返回取消订阅函数
    })

    mockDiaryService = {
      save: vi.fn().mockResolvedValue(undefined)
    }

    mockConfigRepo = {
      get: vi.fn().mockResolvedValue({
        enabled: true,
        minMessageCount: 5,
        triggerThreshold: 1
      })
    }

    mockHistoryRepo = {
      exists: vi.fn().mockResolvedValue(false),
      create: vi.fn().mockResolvedValue('history-id')
    }

    mockMessageRepo = {
      findBySessionId: vi.fn().mockResolvedValue([
        { id: 'msg-1', sessionId: 'session-1', role: 'user', isSummary: false, orderIndex: 0 },
        { id: 'msg-2', sessionId: 'session-1', role: 'assistant', isSummary: false, orderIndex: 1 },
        { id: 'msg-3', sessionId: 'session-1', role: 'user', isSummary: false, orderIndex: 2 },
        { id: 'msg-4', sessionId: 'session-1', role: 'assistant', isSummary: false, orderIndex: 3 },
        { id: 'msg-5', sessionId: 'session-1', role: 'user', isSummary: false, orderIndex: 4 },
        { id: 'msg-6', sessionId: 'session-1', role: 'assistant', isSummary: false, orderIndex: 5 }
      ]),
      getPartsByMessageId: vi.fn().mockImplementation((messageId: string) => {
        const contentMap: Record<string, string> = {
          'msg-1': '你好',
          'msg-2': '你好！',
          'msg-3': '今天天气怎么样',
          'msg-4': '今天天气不错',
          'msg-5': '推荐一些活动',
          'msg-6': '可以去公园散步'
        }
        return Promise.resolve([
          {
            id: `part-${messageId}`,
            messageId,
            sessionId: 'session-1',
            type: 'text',
            data: { text: contentMap[messageId] || '' },
            createdAt: new Date()
          }
        ])
      })
    }

    mockFormatter = {
      formatMessages: vi
        .fn()
        .mockResolvedValue(
          '##### 14:30 自动中途追加\n\n**新增关键词**: 天气, 活动\n\n### 🔄 人物状态更新\n\n| 人物 | 互动 | 状态变化 |\n|------|------|----------|\n| 用户 | 询问天气和活动 | 寻求建议 |\n\n### ⏰ 14:30·闲聊时刻\n\n用户向 AI 询问今日天气，AI 回应天气不错。随后用户请 AI 推荐活动，AI 建议去公园散步。'
        )
    }

    service = new AutoSnapshotService(
      mockDiaryService as DiaryService,
      mockConfigRepo as AutoSnapshotConfigRepository,
      mockHistoryRepo as AutoSnapshotHistoryRepository,
      mockMessageRepo as AgentMessageRepository,
      mockFormatter as MidwayAppendFormatter
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('initialize', () => {
    it('should register compression lifecycle listener', async () => {
      const { onCompressionLifecycle } = await import('@baishou/ai')

      await service.initialize()

      expect(onCompressionLifecycle).toHaveBeenCalledWith(expect.any(Function))
    })
  })

  describe('compression finish event', () => {
    it('should create snapshot when compression finishes successfully', async () => {
      await service.initialize()

      await compressionHandler({
        type: 'finish',
        sessionId: 'session-1',
        phase: 'auto',
        ok: true,
        coveredUpToMessageId: 'msg-6',
        snapshotId: 'snapshot-1'
      })

      expect(mockHistoryRepo.exists).toHaveBeenCalledWith('snapshot-1')
      expect(mockMessageRepo.findBySessionId).toHaveBeenCalledWith('session-1')
      expect(mockFormatter.formatMessages).toHaveBeenCalledWith(
        expect.arrayContaining([
          { role: 'user', content: '你好' },
          { role: 'assistant', content: '你好！' }
        ]),
        expect.any(Date)
      )
      expect(mockDiaryService.save).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          content: expect.stringContaining('自动中途追加')
        })
      )
      expect(mockHistoryRepo.create).toHaveBeenCalledWith({
        sessionId: 'session-1',
        snapshotId: 'snapshot-1',
        messageCount: 6
      })
    })

    it('should not create snapshot when config is disabled', async () => {
      vi.mocked(mockConfigRepo.get!).mockResolvedValue({
        enabled: false,
        minMessageCount: 5,
        triggerThreshold: 1
      })

      await service.initialize()

      await compressionHandler({
        type: 'finish',
        sessionId: 'session-1',
        phase: 'auto',
        ok: true,
        coveredUpToMessageId: 'msg-6',
        snapshotId: 'snapshot-1'
      })

      expect(mockDiaryService.save).not.toHaveBeenCalled()
    })

    it('should not create snapshot when message count is below threshold', async () => {
      vi.mocked(mockMessageRepo.findBySessionId!).mockResolvedValue([
        { id: 'msg-1', sessionId: 'session-1', role: 'user', isSummary: false, orderIndex: 0 },
        { id: 'msg-2', sessionId: 'session-1', role: 'assistant', isSummary: false, orderIndex: 1 }
      ])
      vi.mocked(mockMessageRepo.getPartsByMessageId!).mockImplementation((messageId: string) => {
        const contentMap: Record<string, string> = {
          'msg-1': '你好',
          'msg-2': '你好！'
        }
        return Promise.resolve([
          {
            id: `part-${messageId}`,
            messageId,
            sessionId: 'session-1',
            type: 'text',
            data: { text: contentMap[messageId] || '' },
            createdAt: new Date()
          }
        ])
      })

      await service.initialize()

      await compressionHandler({
        type: 'finish',
        sessionId: 'session-1',
        phase: 'auto',
        ok: true,
        coveredUpToMessageId: 'msg-2',
        snapshotId: 'snapshot-1'
      })

      expect(mockDiaryService.save).not.toHaveBeenCalled()
    })

    it('should not create duplicate snapshot for same snapshotId', async () => {
      vi.mocked(mockHistoryRepo.exists!).mockResolvedValue(true)

      await service.initialize()

      await compressionHandler({
        type: 'finish',
        sessionId: 'session-1',
        phase: 'auto',
        ok: true,
        coveredUpToMessageId: 'msg-6',
        snapshotId: 'snapshot-1'
      })

      expect(mockDiaryService.save).not.toHaveBeenCalled()
    })

    it('should not trigger when compression fails', async () => {
      await service.initialize()

      await compressionHandler({
        type: 'finish',
        sessionId: 'session-1',
        phase: 'auto',
        ok: false,
        coveredUpToMessageId: 'msg-6',
        snapshotId: 'snapshot-1'
      })

      expect(mockDiaryService.save).not.toHaveBeenCalled()
    })

    it('should not trigger for non-finish events', async () => {
      await service.initialize()

      await compressionHandler({
        type: 'start',
        sessionId: 'session-1',
        phase: 'auto'
      })

      expect(mockDiaryService.save).not.toHaveBeenCalled()
    })

    it('should handle diary save failure gracefully', async () => {
      vi.mocked(mockDiaryService.save!).mockRejectedValue(new Error('Diary save failed'))

      await service.initialize()

      await expect(
        compressionHandler({
          type: 'finish',
          sessionId: 'session-1',
          phase: 'auto',
          ok: true,
          coveredUpToMessageId: 'msg-6',
          snapshotId: 'snapshot-1'
        })
      ).resolves.not.toThrow()

      expect(mockHistoryRepo.create).not.toHaveBeenCalled()
    })
  })
})
