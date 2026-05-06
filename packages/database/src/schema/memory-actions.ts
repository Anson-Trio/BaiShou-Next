import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";

/**
 * MemoryAction — 双向记忆关联表
 *
 * 记录 AI 行动与记忆之间的因果关联：
 * - triggerMemory: 触发记忆（用户说了什么/发生了什么）
 * - targetMemory:  结果记忆（AI 做了什么/返回了什么）
 *
 * 设计原则：
 * - 双向可见（正向触发 + 逆向追溯）
 * - actionType 枚举确保语义可解析
 * - weight 表示关联强度（强/中/弱）
 */
export const memoryActionsTable = sqliteTable('memory_actions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  triggerMemoryId: integer('trigger_memory_id').notNull(),
  targetMemoryId: integer('target_memory_id').notNull(),
  actionType: text('action_type').notNull(),
  weight: real('weight').notNull().default(0.7),
  description: text('description').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// --- ActionType 枚举 ---
export type MemoryActionType =
  | 'data_analysis'
  | 'weather_check'
  | 'document_review'
  | 'summary_generated'
  | 'reflection'
  | 'search_result'
  | 'preference_update'
  | 'reminder_sent';

// --- Weight 常量 ---
export const MemoryActionWeight = {
  STRONG: 1.0,
  MEDIUM: 0.7,
  WEAK: 0.3,
} as const;

// --- 关联类型标签（用于前端展示） ---
export const MemoryActionTypeLabels: Record<MemoryActionType, string> = {
  data_analysis: '📊 数据分析',
  weather_check: '🌤️ 天气查询',
  document_review: '📄 文档分析',
  summary_generated: '📝 摘要生成',
  reflection: '🤔 AI 反思',
  search_result: '🔍 搜索结果',
  preference_update: '⚙️ 偏好更新',
  reminder_sent: '⏰ 提醒发送',
};
