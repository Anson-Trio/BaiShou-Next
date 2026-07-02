import { generateText } from 'ai'
import type { IAIProvider } from '@baishou/ai'
import { DEFAULT_MIDWAY_APPEND_PROMPT, logger } from '@baishou/shared'

// MidwayAppendFormatter：使用 AI 将对话消息格式化为中途追加日记格式
// 调用方：packages/core/src/diary/auto-snapshot.service.ts
// API：formatMessages(messages, timestamp)
// 架构：调用 AI 生成日记内容,失败时降级到简单格式

export interface MessageForFormat {
  role: string
  content: string
}

export class MidwayAppendFormatter {
  constructor(
    private provider: IAIProvider,
    private modelId: string
  ) {}

  /**
   * 使用 AI 将对话消息格式化为中途追加日记格式
   * @param messages 待格式化的消息列表
   * @param timestamp 快照时间戳
   * @returns 格式化后的 Markdown 内容
   */
  async formatMessages(messages: MessageForFormat[], timestamp: Date): Promise<string> {
    try {
      const timeStr = timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

      // 构建消息文本
      const messagesText = messages
        .map((msg) => {
          const roleLabel = msg.role === 'user' ? '用户' : 'AI'
          return `${roleLabel}: ${msg.content}`
        })
        .join('\n\n')

      // 替换模板占位符
      const prompt = DEFAULT_MIDWAY_APPEND_PROMPT.replace('{time}', timeStr).replace(
        '{messages}',
        messagesText
      )

      // 调用 AI 生成
      const result = await generateText({
        model: this.provider.getLanguageModel(this.modelId),
        prompt,
        maxRetries: 2
      })

      return result.text.trim()
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error))
      logger.error('[MidwayAppendFormatter] AI 格式化失败,降级到简单格式:', errorObj)
      return this.formatSimple(messages, timestamp)
    }
  }

  /**
   * 降级方案：简单格式化（不使用 AI）
   */
  private formatSimple(messages: MessageForFormat[], timestamp: Date): string {
    const timeStr = timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    let content = `\n\n##### ${timeStr} 自动中途追加\n\n`
    content += `> 本次对话共 ${messages.length} 条消息\n\n`

    for (const msg of messages) {
      const roleLabel = msg.role === 'user' ? '我' : 'AI'
      content += `**${roleLabel}**: ${msg.content}\n\n`
    }

    return content
  }
}
