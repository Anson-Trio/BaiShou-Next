import { sleepDreamsTable, InsertDreamPayload, SleepDreamPhase } from '../schema/sleep-dreams';
import { AppDatabase } from '../types';
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';

export class SleepDreamsRepository {
  constructor(private readonly database: AppDatabase) {}

  // ==================== 基础 CRUD ====================

  /**
   * 插入一条梦境记录
   */
  async insert(payload: InsertDreamPayload): Promise<number> {
    const result = await this.database.insert(sleepDreamsTable).values({
      dreamId: payload.dreamId,
      dreamDate: payload.dreamDate,
      phase: payload.phase,
      title: payload.title ?? '',
      content: payload.content,
      emotionTags: JSON.stringify(payload.emotionTags ?? []),
      topicTags: JSON.stringify(payload.topicTags ?? []),
      relatedMemoryIds: JSON.stringify(payload.relatedMemoryIds ?? []),
      insightScore: payload.insightScore ?? null,
      embeddingId: payload.embeddingId ?? null,
    }).returning({ id: sleepDreamsTable.id });

    return result[0]!.id;
  }

  /**
   * 按 dreamId 查询
   */
  async findByDreamId(dreamId: string): Promise<any | null> {
    const results = await this.database
      .select()
      .from(sleepDreamsTable)
      .where(eq(sleepDreamsTable.dreamId, dreamId))
      .limit(1);
    return results[0] ? this.parseDream(results[0]) : null;
  }

  /**
   * 按日期范围查询
   */
  async findByDateRange(startDate: string, endDate: string): Promise<any[]> {
    const results = await this.database
      .select()
      .from(sleepDreamsTable)
      .where(
        and(
          gte(sleepDreamsTable.dreamDate, startDate),
          lte(sleepDreamsTable.dreamDate, endDate)
        )
      )
      .orderBy(desc(sleepDreamsTable.createdAt));
    return results.map(r => this.parseDream(r));
  }

  /**
   * 按阶段查询某日的所有梦境
   */
  async findByDateAndPhase(date: string, phase?: SleepDreamPhase): Promise<any[]> {
    let condition = eq(sleepDreamsTable.dreamDate, date);
    if (phase) {
      condition = and(condition, eq(sleepDreamsTable.phase, phase)) as any;
    }
    const results = await this.database
      .select()
      .from(sleepDreamsTable)
      .where(condition)
      .orderBy(desc(sleepDreamsTable.createdAt));
    return results.map(r => this.parseDream(r));
  }

  /**
   * 查询最近的 N 条梦境
   */
  async findRecent(limit: number = 10): Promise<any[]> {
    const results = await this.database
      .select()
      .from(sleepDreamsTable)
      .orderBy(desc(sleepDreamsTable.createdAt))
      .limit(limit);
    return results.map(r => this.parseDream(r));
  }

  /**
   * 更新梦境内容
   */
  async updateContent(dreamId: string, content: string, title?: string): Promise<void> {
    await this.database
      .update(sleepDreamsTable)
      .set({
        content,
        title: title ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(sleepDreamsTable.dreamId, dreamId));
  }

  /**
   * 更新洞察评分（Deep 阶段）
   */
  async updateInsightScore(dreamId: string, score: number): Promise<void> {
    await this.database
      .update(sleepDreamsTable)
      .set({
        insightScore: score,
        updatedAt: new Date(),
      })
      .where(eq(sleepDreamsTable.dreamId, dreamId));
  }

  /**
   * 添加关联记忆 ID
   */
  async addRelatedMemory(dreamId: string, memoryIds: string[]): Promise<void> {
    const existing = await this.findByDreamId(dreamId);
    if (!existing) return;

    const currentIds: string[] = existing.relatedMemoryIds || [];
    const merged = Array.from(new Set([...currentIds, ...memoryIds]));

    await this.database
      .update(sleepDreamsTable)
      .set({
        relatedMemoryIds: JSON.stringify(merged),
        updatedAt: new Date(),
      })
      .where(eq(sleepDreamsTable.dreamId, dreamId));
  }

  /**
   * 删除梦境
   */
  async delete(dreamId: string): Promise<void> {
    await this.database
      .delete(sleepDreamsTable)
      .where(eq(sleepDreamsTable.dreamId, dreamId));
  }

  /**
   * 按日期删除所有梦境
   */
  async deleteByDate(date: string): Promise<void> {
    await this.database
      .delete(sleepDreamsTable)
      .where(eq(sleepDreamsTable.dreamDate, date));
  }

  // ==================== 统计查询 ====================

  /**
   * 统计某阶段的梦境数量
   */
  async countByPhase(phase: SleepDreamPhase): Promise<number> {
    const result = await this.database
      .select({ count: sql<number>`count(*)` })
      .from(sleepDreamsTable)
      .where(eq(sleepDreamsTable.phase, phase));
    return result[0]?.count ?? 0;
  }

  /**
   * 获取所有日期列表（去重）
   */
  async getAllDates(): Promise<string[]> {
    const results = await this.database
      .selectDistinct({ date: sleepDreamsTable.dreamDate })
      .from(sleepDreamsTable)
      .orderBy(desc(sleepDreamsTable.dreamDate));
    return results.map(r => r.date);
  }

  // ==================== 私有工具 ====================

  private parseDream(raw: any): any {
    return {
      ...raw,
      emotionTags: JSON.parse(raw.emotionTags || '[]'),
      topicTags: JSON.parse(raw.topicTags || '[]'),
      relatedMemoryIds: JSON.parse(raw.relatedMemoryIds || '[]'),
    };
  }
}
