import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";

/**
 * SleepDreams — 睡眠梦境/反思表
 *
 * 存储 AI 生成的反思摘要（给 AI 自身使用，不是给人看的日记）。
 *
 * 设计原则：
 * - Diary = 给人看（用户写的对话日志）
 * - Dreams = 给 AI 看（AI 生成的反思摘要）
 * - 两者正交独立，绝不关联
 *
 * 三阶段管线：
 * - Light:   对话结束时快速整理（生成反思摘要）
 * - Deep:   重要度评分 + 记忆晋升
 * - REM:    主题聚类 + 洞察提取
 */
export const sleepDreamsTable = sqliteTable('sleep_dreams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // 唯一标识符（UUID 或 日期+phase 组合）
  dreamId: text('dream_id').notNull().unique(),
  // 梦境日期
  dreamDate: text('dream_date').notNull(), // YYYY-MM-DD 格式
  // 阶段：light | deep | rem
  phase: text('phase').notNull(),
  // 标题（AI 生成）
  title: text('title').notNull().default(''),
  // 内容（AI 生成的反思摘要）
  content: text('content').notNull().default(''),
  // 情绪标签
  emotionTags: text('emotion_tags').notNull().default(''), // JSON 数组序列化
  // 主题标签
  topicTags: text('topic_tags').notNull().default(''),     // JSON 数组序列化
  // 关联的记忆 ID（用于追溯哪些记忆生成了此梦）
  relatedMemoryIds: text('related_memory_ids').notNull().default(''), // JSON 数组序列化
  // 洞察评分（Deep 阶段计算）
  insightScore: real('insight_score'),
  // 向量 ID（用于语义搜索）
  embeddingId: text('embedding_id'),
  // 创建时间
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  // 更新时间
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// --- 类型导出 ---
export type SleepDreamPhase = 'light' | 'deep' | 'rem';

export interface SleepDreamRecord {
  id: number;
  dreamId: string;
  dreamDate: string;
  phase: SleepDreamPhase;
  title: string;
  content: string;
  emotionTags: string[];
  topicTags: string[];
  relatedMemoryIds: string[];
  insightScore: number | null;
  embeddingId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertDreamPayload {
  dreamId: string;
  dreamDate: string;
  phase: SleepDreamPhase;
  title?: string;
  content: string;
  emotionTags?: string[];
  topicTags?: string[];
  relatedMemoryIds?: string[];
  insightScore?: number;
  embeddingId?: string;
}
