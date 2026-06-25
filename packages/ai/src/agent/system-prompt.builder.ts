import { buildMessageMetadataSystemPromptLines } from '@baishou/shared'

export interface SystemPromptBuilderOptions {
  vaultName: string
  tools: Record<string, any> // 此刻所有通过了验证准备好交给模型的 Tool 实例集
  customPersona?: string
  customGuidelines?: string
  userProfileBlock?: string
  /** 伙伴使用写日记 / 编辑日记工具时的书写规范 */
  diaryAiWritingPrompt?: string
  /** 表情包配置，包含可用表情包列表和回复概率 */
  emojiConfig?: {
    enabled: boolean
    replyProbability: number
    emojis: Array<{ id: string; name: string; relativePath: string }>
  } | null
}

export class SystemPromptBuilder {
  /**
   * 构建带有当前环境、所在时间、生效工具以及自定义教条的最终提示词
   */
  public static build(options: SystemPromptBuilderOptions): string {
    const {
      vaultName,
      tools,
      customPersona,
      customGuidelines,
      userProfileBlock,
      diaryAiWritingPrompt,
      emojiConfig
    } = options

    const buffer: string[] = []

    // 人设设定（如果用户或者系统传入了特殊要求）
    if (customPersona && customPersona.trim().length > 0) {
      buffer.push('<assistant_persona>')
      buffer.push(customPersona.trim())
      buffer.push('</assistant_persona>')
      buffer.push('')
    }

    // 用户的偏好属性或者个人小卡片
    if (userProfileBlock && userProfileBlock.trim().length > 0) {
      buffer.push('<user_identity>')
      buffer.push(
        '[Important: The following identity card describes the USER (human), NOT you (the AI assistant). Use this information to personalize your responses, but NEVER claim these facts as your own identity.]'
      )
      buffer.push(userProfileBlock.trim())
      buffer.push('</user_identity>')
      buffer.push('')
    }

    // [不可动摇底线]：精准时间坐标，AI 最缺乏的就是时间观念
    const now = new Date()
    const tzOffset = -now.getTimezoneOffset() / 60
    const tzSign = tzOffset >= 0 ? '+' : ''

    // YYYY-MM-DD HH:mm
    const dateStr =
      `${now.getFullYear()}-` +
      `${String(now.getMonth() + 1).padStart(2, '0')}-` +
      `${String(now.getDate()).padStart(2, '0')} ` +
      `${String(now.getHours()).padStart(2, '0')}:` +
      `${String(now.getMinutes()).padStart(2, '0')}`

    buffer.push('<system_context>')
    buffer.push(`[System Current Date / Time]: ${dateStr} (UTC${tzSign}${tzOffset})`)
    buffer.push(...buildMessageMetadataSystemPromptLines())
    buffer.push(`[Current Vault / Workspace]: ${vaultName}`)
    buffer.push('</system_context>')
    buffer.push('')

    // 工具可用性宣告
    const availableToolIds = Object.keys(tools)
    if (availableToolIds.length > 0) {
      buffer.push('<available_tools>')
      buffer.push('Available Tools:')
      buffer.push(
        'All tools are optional. Use one only when it clearly improves the answer; ' +
          'prefer information already in the conversation (including any rolling compression summary) when sufficient.'
      )
      buffer.push('')
      for (const id of availableToolIds) {
        // 在 Vercel 中 getDescription 比较直接
        const toolObj = tools[id]
        const hint = toolObj?.description || 'No description provided.'
        buffer.push(`- **${id}**: ${hint}`)
      }
      buffer.push('')

      // 高级逻辑防降级：如果用户今天关了 RAG 或是关了 VectorSearch，必须给 AI 打预防针，防止它乱报错
      if (
        !availableToolIds.includes('memory_store') ||
        !availableToolIds.includes('vector_search')
      ) {
        buffer.push(
          'Note: Memory/RAG tools are currently disabled by the user. ' +
            'For storing and retrieving information, use the diary/summary tools instead. ' +
            'Do NOT attempt to call memory_store or vector_search.'
        )
        buffer.push('')
      }

      // 网络搜索工具未启用时，告知模型
      if (!availableToolIds.includes('web_search')) {
        buffer.push(
          'Note: Web search tool is not enabled yet. ' +
            'If the user asks about recent events or current information that requires web search, ' +
            'reply in Chinese with exactly: "您还未启用网络搜索，请在工具栏开启后重试。" ' +
            'Do not use the English word "disabled" or the Chinese word "禁用".'
        )
        buffer.push('')
      }
      buffer.push('</available_tools>')
      buffer.push('')
    } else {
      buffer.push('<available_tools>')
      buffer.push('No tools are currently available.')
      buffer.push('</available_tools>')
      buffer.push('')
    }

    // 表情包工具上下文注入
    if (emojiConfig && emojiConfig.enabled && emojiConfig.emojis && emojiConfig.emojis.length > 0) {
      const probability = Math.round((emojiConfig.replyProbability ?? 0.3) * 100)
      buffer.push('<emoji_stickers>')
      buffer.push(
        `You have access to ${emojiConfig.emojis.length} sticker(s) that you can send using the "emoji_send" tool. ` +
        `There is approximately a ${probability}% chance you should send a sticker in your response — ` +
        `use it naturally when it fits the mood (humor, empathy, celebration, etc.), but do NOT send a sticker on every reply.`
      )
      buffer.push('')
      buffer.push('Available sticker IDs and names:')
      for (const emoji of emojiConfig.emojis) {
        // Display ID without file extension for cleaner reference
        const displayId = emoji.id.replace(/\.[^.]+$/, '')
        buffer.push(`- ${displayId}: ${emoji.name}`)
      }
      buffer.push('')
      buffer.push('To send a sticker, call the emoji_send tool with the emoji_id parameter set to one of the IDs above. The emoji_id is flexible — you can pass the ID with or without the file extension, or use the display name.')
      buffer.push('')
      buffer.push('IMPORTANT: After calling emoji_send, continue your text response normally. Do NOT describe or reference the sticker image in your text. The sticker will be displayed as a separate message automatically.')
      buffer.push('</emoji_stickers>')
      buffer.push('')
    }

    const hasDiaryWriteTools =
      availableToolIds.includes('diary_write') || availableToolIds.includes('diary_edit')
    if (hasDiaryWriteTools && diaryAiWritingPrompt?.trim()) {
      buffer.push('<diary_writing_guidelines>')
      buffer.push(diaryAiWritingPrompt.trim())
      buffer.push('</diary_writing_guidelines>')
      buffer.push('')
    }

    // 额外的行为准则补丁
    if (customGuidelines && customGuidelines.trim().length > 0) {
      buffer.push('<behavior_guidelines>')
      buffer.push(customGuidelines.trim())
      buffer.push('</behavior_guidelines>')
    }

    return buffer.join('\n')
  }
}
