import { eq, and, sql, desc, asc } from 'drizzle-orm';
import { memoryActionsTable, MemoryActionType, MemoryActionWeight } from '../schema/memory-actions';
import { AppDatabase } from '../types';

export interface CreateMemoryActionPayload {
  triggerMemoryId: number;
  targetMemoryId: number;
  actionType: MemoryActionType;
  weight?: number;
  description?: string;
}

export interface QueryMemoryActionsOptions {
  memoryId?: number;
  actionType?: MemoryActionType;
  limit?: number;
  offset?: number;
}

export class MemoryActionsRepository {
  constructor(private readonly database: AppDatabase) {}

  /**
   * 创建一条记忆关联
   */
  async createAction(data: CreateMemoryActionPayload): Promise<number> {
    const result = await this.database.insert(memoryActionsTable).values({
      triggerMemoryId: data.triggerMemoryId,
      targetMemoryId: data.targetMemoryId,
      actionType: data.actionType,
      weight: data.weight ?? MemoryActionWeight.MEDIUM,
      description: data.description ?? '',
    });

    // result[0].lastInsertRowid() 获取自增 ID
    const inserted = await this.database.select({
      id: memoryActionsTable.id,
    })
      .from(memoryActionsTable)
      .orderBy(desc(memoryActionsTable.id))
      .limit(1);

    return inserted[0]?.id ?? 0;
  }

  /**
   * 批量创建关联（一次 MCP 调用可能产生多条关联）
   */
  async createActionsBulk(actions: CreateMemoryActionPayload[]): Promise<number[]> {
    if (actions.length === 0) return [];

    const inserted = await this.database.insert(memoryActionsTable).values(
      actions.map(a => ({
        triggerMemoryId: a.triggerMemoryId,
        targetMemoryId: a.targetMemoryId,
        actionType: a.actionType,
        weight: a.weight ?? MemoryActionWeight.MEDIUM,
        description: a.description ?? '',
      }))
    );

    // 获取所有插入的 ID
    const ids = await this.database.select({ id: memoryActionsTable.id })
      .from(memoryActionsTable)
      .orderBy(desc(memoryActionsTable.id))
      .limit(actions.length);

    return ids.map(r => r.id);
  }

  /**
   * 查询某条记忆作为触发端的所有关联（正向传播源）
   */
  async getActionsByTriggerMemoryId(
    triggerMemoryId: number,
    options?: { limit?: number; offset?: number }
  ): Promise<any[]> {
    return this.database.select()
      .from(memoryActionsTable)
      .where(eq(memoryActionsTable.triggerMemoryId, triggerMemoryId))
      .orderBy(desc(memoryActionsTable.createdAt))
      .limit(options?.limit ?? 20)
      .offset(options?.offset ?? 0);
  }

  /**
   * 查询某条记忆作为结果端的所有关联（反向传播源 / backlinks）
   */
  async getActionsByTargetMemoryId(
    targetMemoryId: number,
    options?: { limit?: number; offset?: number }
  ): Promise<any[]> {
    return this.database.select()
      .from(memoryActionsTable)
      .where(eq(memoryActionsTable.targetMemoryId, targetMemoryId))
      .orderBy(desc(memoryActionsTable.createdAt))
      .limit(options?.limit ?? 20)
      .offset(options?.offset ?? 0);
  }

  /**
   * 查询双向关联（给图传播用）
   * 返回 { memoryId, totalWeight, actions[] }
   */
  async getBidirectionalLinksForMemory(
    memoryId: number,
    limit?: number
  ): Promise<{
    triggerLinks: any[];
    targetLinks: any[];
  }> {
    const [triggerLinks, targetLinks] = await Promise.all([
      this.database.select()
        .from(memoryActionsTable)
        .where(eq(memoryActionsTable.triggerMemoryId, memoryId))
        .orderBy(desc(memoryActionsTable.weight))
        .limit(limit ?? 10),
      this.database.select()
        .from(memoryActionsTable)
        .where(eq(memoryActionsTable.targetMemoryId, memoryId))
        .orderBy(desc(memoryActionsTable.weight))
        .limit(limit ?? 10),
    ]);

    return { triggerLinks, targetLinks };
  }

  /**
   * 按 actionType 筛选关联
   */
  async getActionsByType(
    actionType: MemoryActionType,
    options?: { limit?: number; offset?: number }
  ): Promise<any[]> {
    return this.database.select()
      .from(memoryActionsTable)
      .where(eq(memoryActionsTable.actionType, actionType))
      .orderBy(desc(memoryActionsTable.createdAt))
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0);
  }

  /**
   * 获取某段时间内的所有行动（"她为你做过什么"）
   */
  async getRecentActions(
    days: number = 7,
    limit: number = 50
  ): Promise<any[]> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.database.select()
      .from(memoryActionsTable)
      .orderBy(desc(memoryActionsTable.createdAt))
      .limit(limit);
  }

  /**
   * 删除关联
   */
  async deleteAction(id: number): Promise<void> {
    await this.database.delete(memoryActionsTable)
      .where(eq(memoryActionsTable.id, id));
  }

  /**
   * 批量删除（删除某条记忆相关的所有关联）
   */
  async deleteActionsByMemoryId(memoryId: number): Promise<void> {
    await this.database.delete(memoryActionsTable)
      .where(
        eq(memoryActionsTable.triggerMemoryId, memoryId)
      );
    await this.database.delete(memoryActionsTable)
      .where(
        eq(memoryActionsTable.targetMemoryId, memoryId)
      );
  }

  /**
   * 更新关联描述（用于补充/修正 AI 生成的描述）
   */
  async updateActionDescription(id: number, description: string): Promise<void> {
    await this.database.update(memoryActionsTable)
      .set({ description })
      .where(eq(memoryActionsTable.id, id));
  }

  /**
   * 更新关联强度
   */
  async updateActionWeight(id: number, weight: number): Promise<void> {
    await this.database.update(memoryActionsTable)
      .set({ weight })
      .where(eq(memoryActionsTable.id, id));
  }

  /**
   * 统计某条记忆的关联数量
   */
  async getActionCountForMemory(memoryId: number): Promise<{ asTrigger: number; asTarget: number }> {
    const [asTrigger, asTarget] = await Promise.all([
      this.database.$count(
        memoryActionsTable,
        eq(memoryActionsTable.triggerMemoryId, memoryId)
      ),
      this.database.$count(
        memoryActionsTable,
        eq(memoryActionsTable.targetMemoryId, memoryId)
      ),
    ]);
    return { asTrigger, asTarget };
  }
}
