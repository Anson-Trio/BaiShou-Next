import { ipcMain } from 'electron';
import { getAppDb } from '../db';
import { memoryActionsTable, memoryEmbeddingsTable } from '@baishou/database';
import { MemoryActionTypeLabels } from '@baishou/database';
import { eq, desc, sql, gte } from 'drizzle-orm';

/**
 * Memory Action IPC — "她为你做过什么"行动面板
 *
 * 核心查询：
 * 1. 获取最近的 AI 行动记录（按时间倒序）
 * 2. 按 actionType 筛选
 * 3. 获取某记忆的关联行动（正向 + 逆向）
 */
export function registerMemoryActionIPC(): void {

  /**
   * 获取最近的 AI 行动记录
   *
   * @param days 往前追溯天数，默认 7 天
   * @param limit 返回数量，默认 50
   * @param actionType 可选，按类型筛选
   */
  ipcMain.handle('memory:get-recent-actions', async (_, options?: {
    days?: number;
    limit?: number;
    actionType?: string;
  }) => {
    const db = getAppDb();
    const days = options?.days ?? 7;
    const limit = options?.limit ?? 50;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let query = db
      .select({
        id: memoryActionsTable.id,
        triggerMemoryId: memoryActionsTable.triggerMemoryId,
        targetMemoryId: memoryActionsTable.targetMemoryId,
        actionType: memoryActionsTable.actionType,
        weight: memoryActionsTable.weight,
        description: memoryActionsTable.description,
        createdAt: memoryActionsTable.createdAt,
      })
      .from(memoryActionsTable)
      .where(gte(memoryActionsTable.createdAt, cutoff))
      .orderBy(desc(memoryActionsTable.createdAt))
      .limit(limit);

    const actions = await query;

    const triggerIds = actions.map(a => a.triggerMemoryId);
    const targetIds = actions.map(a => a.targetMemoryId);
    const allIds = [...new Set([...triggerIds, ...targetIds])];

    if (allIds.length === 0) return [];

    const memories = await db
      .select({
        id: memoryEmbeddingsTable.id,
        title: memoryEmbeddingsTable.title,
        chunkText: memoryEmbeddingsTable.chunkText,
        folderPath: memoryEmbeddingsTable.folderPath,
        source: memoryEmbeddingsTable.source,
      })
      .from(memoryEmbeddingsTable)
      .where(sql`${memoryEmbeddingsTable.id} IN (${allIds.join(',')})`);

    const memoryMap = new Map(memories.map(m => [m.id, m]));

    return actions.map(action => {
      const triggerMemory = memoryMap.get(action.triggerMemoryId);
      const targetMemory = memoryMap.get(action.targetMemoryId);

      return {
        id: action.id,
        actionType: action.actionType,
        actionTypeLabel: MemoryActionTypeLabels[action.actionType as keyof typeof MemoryActionTypeLabels] ?? action.actionType,
        weight: action.weight,
        description: action.description,
        createdAt: action.createdAt?.getTime() || 0,
        trigger: triggerMemory ? {
          id: triggerMemory.id,
          title: triggerMemory.title || triggerMemory.chunkText?.slice(0, 50) || '(无标题)',
          folderPath: triggerMemory.folderPath,
        } : null,
        target: targetMemory ? {
          id: targetMemory.id,
          title: targetMemory.title || targetMemory.chunkText?.slice(0, 50) || '(无标题)',
          folderPath: targetMemory.folderPath,
        } : null,
      };
    });
  });

  /**
   * 获取某条记忆的所有关联行动
   */
  ipcMain.handle('memory:get-actions-for-memory', async (_, memoryId: number) => {
    const db = getAppDb();

    const asTrigger = await db
      .select({
        id: memoryActionsTable.id,
        targetMemoryId: memoryActionsTable.targetMemoryId,
        actionType: memoryActionsTable.actionType,
        weight: memoryActionsTable.weight,
        description: memoryActionsTable.description,
        createdAt: memoryActionsTable.createdAt,
      })
      .from(memoryActionsTable)
      .where(eq(memoryActionsTable.triggerMemoryId, memoryId))
      .orderBy(desc(memoryActionsTable.createdAt));

    const asTarget = await db
      .select({
        id: memoryActionsTable.id,
        triggerMemoryId: memoryActionsTable.triggerMemoryId,
        actionType: memoryActionsTable.actionType,
        weight: memoryActionsTable.weight,
        description: memoryActionsTable.description,
        createdAt: memoryActionsTable.createdAt,
      })
      .from(memoryActionsTable)
      .where(eq(memoryActionsTable.targetMemoryId, memoryId))
      .orderBy(desc(memoryActionsTable.createdAt));

    const targetIds = asTrigger.map(a => a.targetMemoryId);
    const triggerIds = asTarget.map(a => a.triggerMemoryId);
    const allIds = [...new Set([...targetIds, ...triggerIds])];

    let memoryMap = new Map();
    if (allIds.length > 0) {
      const memories = await db
        .select({
          id: memoryEmbeddingsTable.id,
          title: memoryEmbeddingsTable.title,
          chunkText: memoryEmbeddingsTable.chunkText,
        })
        .from(memoryEmbeddingsTable)
        .where(sql`${memoryEmbeddingsTable.id} IN (${allIds.join(',')})`);
      memoryMap = new Map(memories.map(m => [m.id, m]));
    }

    const formatAction = (a: any, direction: 'trigger' | 'target') => {
      const relatedId = direction === 'trigger' ? a.triggerMemoryId : a.targetMemoryId;
      const related = memoryMap.get(relatedId);
      return {
        id: a.id,
        direction,
        actionType: a.actionType,
        actionTypeLabel: MemoryActionTypeLabels[a.actionType as keyof typeof MemoryActionTypeLabels] ?? a.actionType,
        weight: a.weight,
        description: a.description,
        createdAt: a.createdAt?.getTime() || 0,
        relatedMemory: related ? {
          id: related.id,
          title: related.title || related.chunkText?.slice(0, 50) || '(无标题)',
        } : null,
      };
    };

    return {
      asTrigger: asTrigger.map(a => formatAction(a, 'trigger')),
      asTarget: asTarget.map(a => formatAction(a, 'target')),
    };
  });

  /**
   * 获取行动统计（每个类型的数量）
   */
  ipcMain.handle('memory:get-action-stats', async (_, days: number = 30) => {
    const db = getAppDb();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const stats = await db
      .select({
        actionType: memoryActionsTable.actionType,
        count: sql<number>`count(*)`,
      })
      .from(memoryActionsTable)
      .where(gte(memoryActionsTable.createdAt, cutoff))
      .groupBy(memoryActionsTable.actionType)
      .orderBy(sql`count(*) DESC`);

    return stats.map(s => ({
      actionType: s.actionType,
      actionTypeLabel: MemoryActionTypeLabels[s.actionType as keyof typeof MemoryActionTypeLabels] ?? s.actionType,
      count: Number(s.count),
    }));
  });

  /**
   * 删除一条行动关联
   */
  ipcMain.handle('memory:delete-action', async (_, actionId: number) => {
    const db = getAppDb();
    await db.delete(memoryActionsTable).where(eq(memoryActionsTable.id, actionId));
    return true;
  });

  /**
   * 更新行动描述（用于用户手动补充 AI 生成的描述）
   */
  ipcMain.handle('memory:update-action-description', async (_, actionId: number, description: string) => {
    const db = getAppDb();
    await db
      .update(memoryActionsTable)
      .set({ description })
      .where(eq(memoryActionsTable.id, actionId));
    return true;
  });

  /**
   * 获取可用的 actionType 列表（用于筛选下拉）
   */
  ipcMain.handle('memory:get-action-types', async () => {
    return Object.entries(MemoryActionTypeLabels).map(([value, label]) => ({
      value,
      label,
    }));
  });
}
