import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MidwayAppendFormatter } from '../midway-append-formatter.service'
import type { IAIProvider } from '@baishou/ai'

// TDD：中途追加格式化器测试
// 测试目标：验证 AI 格式化功能与降级方案

vi.mock('ai', () => ({
  generateText: vi.fn()
}))

describe('MidwayAppendFormatter', () => {
  let formatter: MidwayAppendFormatter
  let mockProvider: Partial<IAIProvider>
  let mockModel: any

  beforeEach(async () => {
    vi.clearAllMocks()

    mockModel = { id: 'test-model' }
    mockProvider = {
      getLanguageModel: vi.fn().mockReturnValue(mockModel)
    }

    formatter = new MidwayAppendFormatter(mockProvider as IAIProvider, 'test-model-id')
  })

  describe('formatMessages', () => {
    it('should format messages using AI when successful', async () => {
      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({
        text: '##### 14:30 自动中途追加\n\n**新增关键词**: 测试, 对话\n\n### 🔄 人物状态更新\n\n| 人物 | 互动 | 状态变化 |\n|------|------|----------|\n| 用户 | 发起问候 | 开始对话 |\n\n### ⏰ 14:30·问候\n\n用户向 AI 问好，AI 回应问候。',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 50 }
      } as any)

      const messages = [
        { role: 'user', content: '你好' },
        { role: 'assistant', content: '你好！很高兴见到你' }
      ]

      const timestamp = new Date('2024-01-15T14:30:00')
      const result = await formatter.formatMessages(messages, timestamp)

      expect(generateText).toHaveBeenCalledWith({
        model: mockModel,
        prompt: expect.stringContaining('自动中途记录模式'),
        maxRetries: 2
      })
      expect(result).toContain('自动中途追加')
      expect(result).toContain('新增关键词')
    })

    it('should use simple format when AI call fails', async () => {
      const { generateText } = await import('ai')
      vi.mocked(generateText).mockRejectedValue(new Error('AI error'))

      const messages = [
        { role: 'user', content: '你好' },
        { role: 'assistant', content: '你好！' }
      ]

      const timestamp = new Date('2024-01-15T14:30:00')
      const result = await formatter.formatMessages(messages, timestamp)

      expect(result).toContain('14:30 自动中途追加')
      expect(result).toContain('本次对话共 2 条消息')
      expect(result).toContain('**我**: 你好')
      expect(result).toContain('**AI**: 你好！')
    })

    it('should replace template placeholders correctly', async () => {
      const { generateText } = await import('ai')
      vi.mocked(generateText).mockResolvedValue({
        text: 'formatted content',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 50 }
      } as any)

      const messages = [{ role: 'user', content: '测试消息' }]

      const timestamp = new Date('2024-01-15T14:30:00')
      await formatter.formatMessages(messages, timestamp)

      const callArgs = vi.mocked(generateText).mock.calls[0]?.[0]
      if (!callArgs) {
        throw new Error('generateText was not called')
      }

      // 验证消息内容存在
      expect(callArgs.prompt).toContain('用户: 测试消息')

      // 验证时间占位符在示例中被替换（模板本身还包含 {time} 说明）
      expect(callArgs.prompt).toContain('##### 14:30 自动中途追加')

      // 验证消息占位符被替换为实际内容
      expect(callArgs.prompt).toContain('## 输入对话')
      expect(callArgs.prompt).toContain('用户: 测试消息')

      // 验证模板结构存在
      expect(callArgs.prompt).toContain('自动中途记录模式')
    })

    it('should handle empty messages array', async () => {
      const { generateText } = await import('ai')
      vi.mocked(generateText).mockRejectedValue(new Error('AI error'))

      const result = await formatter.formatMessages([], new Date('2024-01-15T14:30:00'))

      expect(result).toContain('本次对话共 0 条消息')
    })

    it('should format multiple messages correctly in simple mode', async () => {
      const { generateText } = await import('ai')
      vi.mocked(generateText).mockRejectedValue(new Error('AI error'))

      const messages = [
        { role: 'user', content: '第一条消息' },
        { role: 'assistant', content: '第二条消息' },
        { role: 'user', content: '第三条消息' }
      ]

      const result = await formatter.formatMessages(messages, new Date('2024-01-15T14:30:00'))

      expect(result).toContain('本次对话共 3 条消息')
      expect(result).toContain('**我**: 第一条消息')
      expect(result).toContain('**AI**: 第二条消息')
      expect(result).toContain('**我**: 第三条消息')
    })
  })
})
