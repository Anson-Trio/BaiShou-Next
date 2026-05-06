import { ipcMain } from 'electron';
import { getAppDb } from '../db';
import { memoryEmbeddingsTable } from '@baishou/database';
import { eq, sql, isNotNull, like } from 'drizzle-orm';

/**
 * Memory Folder IPC — folderPath 批量管理
 *
 * folderPath 组织规则：
 * - null / '' = 根目录
 * - '工作/项目A' = 工作文件夹下的项目A子文件夹
 * - 层级用 '/' 分隔（类文件路径风格）
 */
export function registerMemoryFolderIPC(): void {

  /**
   * 获取所有文件夹及其记忆数量统计
   */
  ipcMain.handle('memory:get-folder-stats', async () => {
    const db = getAppDb();

    const folders = await db
      .select({
        folderPath: memoryEmbeddingsTable.folderPath,
        count: sql<number>`count(*)`,
      })
      .from(memoryEmbeddingsTable)
      .where(isNotNull(memoryEmbeddingsTable.folderPath))
      .groupBy(memoryEmbeddingsTable.folderPath)
      .orderBy(memoryEmbeddingsTable.folderPath);

    const rootCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(memoryEmbeddingsTable)
      .where(sql`${memoryEmbeddingsTable.folderPath} IS NULL OR ${memoryEmbeddingsTable.folderPath} = ''`);

    return {
      root: { folderPath: null, count: rootCount[0]?.count ?? 0 },
      folders: folders.map(f => ({
        folderPath: f.folderPath,
        count: Number(f.count),
      })),
    };
  });

  /**
   * 获取某文件夹下的所有记忆（分页）
   */
  ipcMain.handle('memory:get-by-folder', async (_, folderPath: string | null, options?: { limit?: number; offset?: number }) => {
    const db = getAppDb();
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    let results;
    if (folderPath === null || folderPath === undefined || folderPath === '') {
      results = await db
        .select()
        .from(memoryEmbeddingsTable)
        .where(sql`${memoryEmbeddingsTable.folderPath} IS NULL OR ${memoryEmbeddingsTable.folderPath} = ''`)
        .orderBy(sql`${memoryEmbeddingsTable.createdAt} DESC`)
        .limit(limit)
        .offset(offset);
    } else {
      results = await db
        .select()
        .from(memoryEmbeddingsTable)
        .where(eq(memoryEmbeddingsTable.folderPath, folderPath))
        .orderBy(sql`${memoryEmbeddingsTable.createdAt} DESC`)
        .limit(limit)
        .offset(offset);
    }

    return results.map(r => ({
      id: r.id,
      embeddingId: r.embeddingId,
      title: r.title,
      chunkText: r.chunkText,
      source: r.source,
      importance: r.importance,
      tags: r.tags,
      createdAt: r.createdAt?.getTime() || 0,
    }));
  });

  /**
   * 将记忆移动到指定文件夹
   */
  ipcMain.handle('memory:move-to-folder', async (_, memoryIds: number[], targetFolderPath: string | null) => {
    const db = getAppDb();

    if (!memoryIds || memoryIds.length === 0) return false;

    const normalizedPath = targetFolderPath === null || targetFolderPath === '' ? null : targetFolderPath;

    for (const id of memoryIds) {
      await db
        .update(memoryEmbeddingsTable)
        .set({ folderPath: normalizedPath })
        .where(eq(memoryEmbeddingsTable.id, id));
    }

    return true;
  });

  /**
   * 重命名文件夹（批量更新路径前缀）
   */
  ipcMain.handle('memory:rename-folder', async (_, oldFolderPath: string, newFolderPath: string) => {
    const db = getAppDb();

    if (!oldFolderPath || !newFolderPath) return false;
    if (oldFolderPath === newFolderPath) return true;

    const memories = await db
      .select({ id: memoryEmbeddingsTable.id, folderPath: memoryEmbeddingsTable.folderPath })
      .from(memoryEmbeddingsTable)
      .where(like(memoryEmbeddingsTable.folderPath, `${oldFolderPath}%`));

    for (const m of memories) {
      if (m.folderPath === oldFolderPath) {
        await db
          .update(memoryEmbeddingsTable)
          .set({ folderPath: newFolderPath })
          .where(eq(memoryEmbeddingsTable.id, m.id));
      } else {
        const newPath = m.folderPath!.replace(oldFolderPath, newFolderPath);
        await db
          .update(memoryEmbeddingsTable)
          .set({ folderPath: newPath })
          .where(eq(memoryEmbeddingsTable.id, m.id));
      }
    }

    return { updatedCount: memories.length };
  });

  /**
   * 创建文件夹（隐式创建——通过移动记忆时自动创建）
   */
  ipcMain.handle('memory:ensure-folder', async (_, folderPath: string) => {
    if (!folderPath || folderPath.trim() === '') return false;
    return true;
  });

  /**
   * 删除文件夹（将文件夹下的记忆移到根目录，或删除记忆）
   */
  ipcMain.handle('memory:delete-folder', async (_, folderPath: string, moveToRoot: boolean = true) => {
    const db = getAppDb();

    if (!folderPath) return false;

    if (moveToRoot) {
      await db
        .update(memoryEmbeddingsTable)
        .set({ folderPath: null })
        .where(eq(memoryEmbeddingsTable.folderPath, folderPath));
    } else {
      await db
        .delete(memoryEmbeddingsTable)
        .where(eq(memoryEmbeddingsTable.folderPath, folderPath));
    }

    return true;
  });

  /**
   * 获取所有唯一 folderPath 列表（用于文件夹选择下拉）
   */
  ipcMain.handle('memory:list-folders', async () => {
    const db = getAppDb();

    const folders = await db
      .select({ folderPath: memoryEmbeddingsTable.folderPath })
      .from(memoryEmbeddingsTable)
      .where(isNotNull(memoryEmbeddingsTable.folderPath))
      .groupBy(memoryEmbeddingsTable.folderPath)
      .orderBy(memoryEmbeddingsTable.folderPath);

    return folders.map(f => f.folderPath).filter(Boolean) as string[];
  });
}
