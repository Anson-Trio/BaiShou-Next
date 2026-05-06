/**
 * SleepService — 睡眠巩固管线（AI 反思生成服务）
 *
 * 三阶段管线：
 * 1. Light Phase   — 对话结束时快速整理，生成反思摘要
 * 2. Deep Phase    — 重要度评分 + 记忆晋升
 * 3. REM Phase     — 主题聚类 + 洞察提取
 *
 * 设计原则：
 * - Diary = 给人看（用户写的对话日志）
 * - Dreams = 给 AI 看（AI 生成的反思摘要）
 * - 两者正交独立，绝不关联
 */

import { SleepDreamsRepository } from '@baishou/database/src/repositories/sleep-dreams.repository';
import { MemoryRepository } from '@baishou/database/src/repositories/memory.repository';
import { InsertDreamPayload, SleepDreamPhase } from '@baishou/database/src/schema/sleep-dreams';

// ==================== AI Client 接口 ====================

export interface SleepAiClient {
  generateContent(prompt: string, modelId?: string): Promise<string>;
}

// ==================== 上下文构建接口 ====================

export interface ConversationContext {
  date: string;                        // YYYY-MM-DD
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
}

export interface DreamQueryOptions {
  startDate?: string;
  endDate?: string;
  phase?: SleepDreamPhase;
  limit?: number;
}

// ==================== SleepService ====================

export class SleepService {
  constructor(
    private readonly dreamsRepo: SleepDreamsRepository,
    private readonly memoryRepo: MemoryRepository,
    private readonly aiClient: SleepAiClient
  ) {}

  // ==================== 对外 API ====================

  /**
   * Light Phase：对话结束时快速生成反思
   *
   * 输入：当天对话上下文
   * 输出：一条 light 阶段梦境记录
   */
  async consolidateLightMemory(conversation: ConversationContext): Promise<string> {
    const date = conversation.date;
    const existingLight = await this.dreamsRepo.findByDateAndPhase(date, 'light');
    if (existingLight.length > 0) {
      // 已存在则更新
      const existing = existingLight[0];
      const updatedContent = await this.generateLightReflection(conversation);
      await this.dreamsRepo.updateContent(existing.dreamId, updatedContent);
      return existing.dreamId;
    }

    // 构建 Prompt
    const prompt = this.buildLightPrompt(conversation);
    const content = await this.aiClient.generateContent(prompt);

    // 解析情绪标签和主题标签
    const { title, emotionTags, topicTags } = await this.extractLightMetadata(content);

    // 保存
    const payload: InsertDreamPayload = {
      dreamId: `dream_${date}_light_${Date.now()}`,
      dreamDate: date,
      phase: 'light',
      title,
      content,
      emotionTags,
      topicTags,
    };

    await this.dreamsRepo.insert(payload);
    return payload.dreamId;
  }

  /**
   * Deep Phase：重要度评分 + 记忆晋升
   *
   * 输入：最近一段时间的 light 梦境
   * 输出：更新 deep 阶段梦境（重要度评分）
   */
  async consolidateDeepMemory(date: string): Promise<string> {
    // 获取最近的 light 梦境
    const recentDreams = await this.dreamsRepo.findByDateAndPhase(date, 'light');
    if (recentDreams.length === 0) {
      throw new Error(`No light dreams found for date: ${date}`);
    }

    const lightDream = recentDreams[0];

    // 生成重要度评分
    const prompt = this.buildDeepPrompt(lightDream.content);
    const scoreResult = await this.aiClient.generateContent(prompt);

    // 解析评分（0-1）
    const score = this.parseScore(scoreResult);

    // 关联相关记忆
    const relatedMemoryIds = await this.findRelatedMemoryIds(lightDream.content);

    // 保存或更新 deep 梦境
    const existingDeep = await this.dreamsRepo.findByDateAndPhase(date, 'deep');
    if (existingDeep.length > 0) {
      await this.dreamsRepo.updateInsightScore(existingDeep[0].dreamId, score);
      if (relatedMemoryIds.length > 0) {
        await this.dreamsRepo.addRelatedMemory(existingDeep[0].dreamId, relatedMemoryIds);
      }
      return existingDeep[0].dreamId;
    }

    const payload: InsertDreamPayload = {
      dreamId: `dream_${date}_deep_${Date.now()}`,
      dreamDate: date,
      phase: 'deep',
      title: `【深度反思】${lightDream.title || date}`,
      content: lightDream.content,
      insightScore: score,
      relatedMemoryIds,
    };

    await this.dreamsRepo.insert(payload);
    return payload.dreamId;
  }

  /**
   * REM Phase：主题聚类 + 洞察提取
   *
   * 输入：最近一段时间的 deep 梦境（通常是多天）
   * 输出：REM 阶段洞察摘要
   */
  async consolidateREM(startDate: string, endDate: string): Promise<string> {
    // 获取日期范围内的所有 deep 梦境
    const deepDreams = await this.dreamsRepo.findByDateRange(startDate, endDate);
    if (deepDreams.length === 0) {
      throw new Error(`No deep dreams found in range: ${startDate} - ${endDate}`);
    }

    // 构建 REM Prompt
    const prompt = this.buildREMPrompt(deepDreams);
    const insights = await this.aiClient.generateContent(prompt);

    // 提取主题和情绪
    const { title, emotionTags, topicTags } = await this.extractLightMetadata(insights);

    // 聚合相关记忆 ID
    const allRelatedIds = deepDreams
      .flatMap(d => d.relatedMemoryIds || [])
      .filter(id => id);

    // 保存 REM 梦境
    const payload: InsertDreamPayload = {
      dreamId: `dream_${startDate}_${endDate}_rem_${Date.now()}`,
      dreamDate: startDate,
      phase: 'rem',
      title: title || `【REM 洞察】${startDate} 至 ${endDate}`,
      content: insights,
      emotionTags,
      topicTags,
      relatedMemoryIds: Array.from(new Set(allRelatedIds)),
    };

    await this.dreamsRepo.insert(payload);
    return payload.dreamId;
  }

  /**
   * 查询梦境
   */
  async queryDreams(options: DreamQueryOptions = {}): Promise<any[]> {
    const { startDate, endDate, phase, limit = 20 } = options;

    if (startDate && endDate) {
      const dreams = await this.dreamsRepo.findByDateRange(startDate, endDate);
      return phase ? dreams.filter(d => d.phase === phase).slice(0, limit) : dreams.slice(0, limit);
    }

    if (startDate) {
      const dreams = await this.dreamsRepo.findByDateAndPhase(startDate, phase);
      return dreams.slice(0, limit);
    }

    return this.dreamsRepo.findRecent(limit);
  }

  /**
   * 删除梦境
   */
  async deleteDream(dreamId: string): Promise<void> {
    await this.dreamsRepo.delete(dreamId);
  }

  // ==================== 私有方法 ====================

  // --- Light Phase ---

  private buildLightPrompt(conversation: ConversationContext): string {
    const messageSummary = conversation.messages
      .map(m => `[${m.role.toUpperCase()}]\n${m.content}`)
      .join('\n\n');

    return `你是一个深度反思 AI。请根据以下对话记录，生成一段简短的反思摘要。

要求：
1. 提炼对话的核心主题和用户意图
2. 识别 AI 回复中可能存在的不足或改进点
3. 总结对用户有价值的洞察
4. 控制在 200 字以内
5. 使用第一人称（"我"）撰写

格式：
【标题】
正文（反思内容）
标签：情绪标签（用逗号分隔）
主题：主题标签（用逗号分隔）

对话记录：
${messageSummary}

请生成反思摘要：`;
  }

  private async generateLightReflection(conversation: ConversationContext): Promise<string> {
    const prompt = this.buildLightPrompt(conversation);
    return this.aiClient.generateContent(prompt);
  }

  private async extractLightMetadata(content: string): Promise<{
    title: string;
    emotionTags: string[];
    topicTags: string[];
  }> {
    // 简单解析：尝试从内容中提取标签
    // 格式：标签：情绪标签（用逗号分隔）/ 主题：主题标签（用逗号分隔）
    const emotionMatch = content.match(/标签：(.+?)(?:\n|$)/i);
    const topicMatch = content.match(/主题：(.+?)(?:\n|$)/i);

    const emotionTags = emotionMatch
      ? emotionMatch[1].split(/[,，]/).map(t => t.trim()).filter(Boolean)
      : [];
    const topicTags = topicMatch
      ? topicMatch[1].split(/[,，]/).map(t => t.trim()).filter(Boolean)
      : [];

    // 提取标题（第一行或 【】 包裹的内容）
    let title = '';
    const titleMatch = content.match(/【(.+?)】/);
    if (titleMatch) {
      title = titleMatch[1];
    } else {
      const firstLine = content.split('\n')[0];
      if (firstLine && firstLine.length < 50) {
        title = firstLine;
      }
    }

    return { title, emotionTags, topicTags };
  }

  // --- Deep Phase ---

  private buildDeepPrompt(lightContent: string): string {
    return `你是一个记忆评估 AI。请评估以下反思内容的重要度评分。

要求：
1. 分析反思内容对用户长期记忆的价值
2. 评分范围 0-1，1 表示极高价值
3. 考虑：洞察深度、实用性、独特性、可执行性

反思内容：
${lightContent}

请只返回一个 0-1 之间的小数，例如：0.73`;
  }

  private parseScore(result: string): number {
    const match = result.match(/0\.\d+/);
    if (match) {
      return Math.min(1, Math.max(0, parseFloat(match[0])));
    }
    // 尝试解析整数
    const intMatch = result.match(/\d+/);
    if (intMatch) {
      const val = parseInt(intMatch[0], 10);
      if (val <= 1) return val;
      if (val <= 10) return val / 10;
      if (val <= 100) return val / 100;
    }
    return 0.5; // 默认中等评分
  }

  private async findRelatedMemoryIds(content: string): Promise<string[]> {
    // 简单实现：提取内容中的关键词，然后在记忆中搜索
    // 步骤：
    // 1. 提取关键概念（名词、动词）
    // 2. 在 memoryEmbeddingsTable 中搜索相关记忆
    // 3. 返回相关记忆的 sourceId 列表
    
    // 提取关键词：简单分词，提取 2-6 个字符的词语
    const keywords = this.extractKeywords(content);
    
    if (keywords.length === 0) {
      return [];
    }

    try {
      // 使用 LIKE 查询搜索相关记忆
      // 限制返回 5 个最相关的结果
      const searchPattern = `%${keywords[0]}%`;
      
      const results = await this.memoryRepo.findByKeyword(searchPattern, 5);
      
      return results.map(r => r.sourceId);
    } catch (error) {
      // 搜索失败时返回空数组，不影响主流程
      console.warn('[SleepService] findRelatedMemoryIds failed:', error);
      return [];
    }
  }

  /**
   * 提取内容中的关键词
   * 简单实现：提取 2-6 个字符的连续中文字符序列
   */
  private extractKeywords(content: string): string[] {
    // 匹配连续 2-6 个中文字符（或英文单词）
    const chinesePattern = /[\u4e00-\u9fa5]{2,6}/g;
    const englishPattern = /[a-zA-Z]{3,10}/g;
    
    const chineseMatches = content.match(chinesePattern) || [];
    const englishMatches = content.match(englishPattern) || [];
    
    // 合并并去重，取前 5 个
    const allWords = [...chineseMatches, ...englishMatches];
    const uniqueWords = Array.from(new Set(allWords));
    
    // 简单过滤：排除常见无意义词
    const stopWords = new Set(['的', '了', '和', '是', '我', '你', '他', '她', '它', '我们', '你们', '他们', '这个', '那个', '什么', '怎么', '为什么', '如果', '但是', '因为', '所以', '虽然', '然后', '之后', '之前', '这里', '那里', '这里', '现在', '今天', '昨天', '明天', '可能', '应该', '可以', '需要', '想要', '觉得', '感觉', '知道', '觉得', 'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'were', 'they', 'this', 'that', 'with', 'from', 'your', 'what']);
    
    const filteredWords = uniqueWords.filter(word => !stopWords.has(word));
    
    return filteredWords.slice(0, 5);
  }

  // --- REM Phase ---

  private buildREMPrompt(deepDreams: any[]): string {
    const dreamsSummary = deepDreams
      .map((d, i) => `=== 第 ${i + 1} 天 ===\n标题：${d.title}\n内容：${d.content}\n评分：${d.insightScore ?? 'N/A'}`)
      .join('\n\n');

    return `你是一个洞察提取 AI。请分析以下多个反思记录，提取核心洞察和主题模式。

要求：
1. 识别跨多天的共同主题和模式
2. 提取最有价值的 3-5 个洞察
3. 总结用户行为的趋势和偏好
4. 生成可操作的建议（如果有）
5. 使用第一人称（"我"）撰写

格式：
【REM 洞察摘要】

## 核心主题
- 主题 1
- 主题 2

## 关键洞察
1. 洞察内容...
2. 洞察内容...

## 行动建议
- 建议 1

反思记录：
${dreamsSummary}

请生成洞察摘要：`;
  }
}
