import { eq, and, sql, desc } from 'drizzle-orm';
import { memoryTagsTable, memoryTagRelationsTable } from '../schema/memory-tags';
import { AppDatabase } from '../types';

export interface CreateTagPayload {
  name: string;
  parentId?: number | null;
}

export interface UpdateTagPayload {
  name?: string;
  parentId?: number | null;
}

export class MemoryTagsRepository {
  constructor(private readonly database: AppDatabase) {}

  // ==================== Tag CRUD ====================

  /**
   * 创建标签
   */
  async createTag(data: CreateTagPayload): Promise<number> {
    const result = await this.database.insert(memoryTagsTable).values({
      name: data.name,
      parentId: data.parentId ?? null,
    });

    const inserted = await this.database.select({ id: memoryTagsTable.id })
      .from(memoryTagsTable)
      .orderBy(desc(memoryTagsTable.id))
      .limit(1);

    return inserted[0]?.id ?? 0;
  }

  /**
   * 批量创建标签（如果已存在则跳过）
   */
  async createTagsBulk(tags: CreateTagPayload[]): Promise<number[]> {
    const results: number[] = [];
    for (const tag of tags) {
      // 先查是否存在
      const existing = await this.database.select({ id: memoryTagsTable.id })
        .from(memoryTagsTable)
        .where(eq(memoryTagsTable.name, tag.name))
        .limit(1);

      if (existing.length > 0) {
        results.push(existing[0].id);
      } else {
        const id = await this.createTag(tag);
        results.push(id);
      }
    }
    return results;
  }

  /**
   * 获取所有标签（可按 parentId 筛选）
   */
  async getAllTags(parentId?: number | null): Promise<any[]> {
    if (parentId === undefined) {
      return this.database.select().from(memoryTagsTable);
    }
    return this.database.select()
      .from(memoryTagsTable)
      .where(eq(memoryTagsTable.parentId, parentId));
  }

  /**
   * 获取标签详情
   */
  async getTagById(id: number): Promise<any | null> {
    const results = await this.database.select()
      .from(memoryTagsTable)
      .where(eq(memoryTagsTable.id, id))
      .limit(1);
    return results[0] ?? null;
  }

  /**
   * 按名称查找标签
   */
  async getTagByName(name: string): Promise<any | null> {
    const results = await this.database.select()
      .from(memoryTagsTable)
      .where(eq(memoryTagsTable.name, name))
      .limit(1);
    return results[0] ?? null;
  }

  /**
   * 更新标签
   */
  async updateTag(id: number, data: UpdateTagPayload): Promise<void> {
    await this.database.update(memoryTagsTable)
      .set({
        name: data.name,
        parentId: data.parentId,
      })
      .where(eq(memoryTagsTable.id, id));
  }

  /**
   * 删除标签（同时清除所有关联）
   */
  async deleteTag(id: number): Promise<void> {
    // 先删关联
    await this.database.delete(memoryTagRelationsTable)
      .where(eq(memoryTagRelationsTable.tagId, id));
    // 再删标签
    await this.database.delete(memoryTagsTable)
      .where(eq(memoryTagsTable.id, id));
  }

  // ==================== Tag Relations ====================

  /**
   * 给记忆添加标签
   */
  async addTagToMemory(memoryId: number, tagId: number): Promise<void> {
    await this.database.insert(memoryTagRelationsTable).values({
      memoryId,
      tagId,
    }).onConflictDoNothing();
  }

  /**
   * 给记忆添加多个标签（批量）
   */
  async addTagsToMemory(memoryId: number, tagIds: number[]): Promise<void> {
    if (tagIds.length === 0) return;
    await this.database.insert(memoryTagRelationsTable).values(
      tagIds.map(tagId => ({ memoryId, tagId }))
    ).onConflictDoNothing();
  }

  /**
   * 移除记忆的某个标签
   */
  async removeTagFromMemory(memoryId: number, tagId: number): Promise<void> {
    await this.database.delete(memoryTagRelationsTable)
      .where(and(
        eq(memoryTagRelationsTable.memoryId, memoryId),
        eq(memoryTagRelationsTable.tagId, tagId)
      ));
  }

  /**
   * 移除记忆的所有标签
   */
  async removeAllTagsFromMemory(memoryId: number): Promise<void> {
    await this.database.delete(memoryTagRelationsTable)
      .where(eq(memoryTagRelationsTable.memoryId, memoryId));
  }

  /**
   * 获取记忆的所有标签
   */
  async getTagsForMemory(memoryId: number): Promise<any[]> {
    return this.database.select({
      id: memoryTagsTable.id,
      name: memoryTagsTable.name,
      parentId: memoryTagsTable.parentId,
    })
      .from(memoryTagRelationsTable)
      .innerJoin(memoryTagsTable, eq(memoryTagRelationsTable.tagId, memoryTagsTable.id))
      .where(eq(memoryTagRelationsTable.memoryId, memoryId));
  }

  /**
   * 获取使用某标签的所有记忆 ID
   */
  async getMemoryIdsByTag(tagId: number): Promise<number[]> {
    const results = await this.database.select({
      memoryId: memoryTagRelationsTable.memoryId,
    })
      .from(memoryTagRelationsTable)
      .where(eq(memoryTagRelationsTable.tagId, tagId));
    return results.map(r => r.memoryId);
  }

  /**
   * 获取某标签的子标签
   */
  async getChildTags(parentId: number): Promise<any[]> {
    return this.database.select()
      .from(memoryTagsTable)
      .where(eq(memoryTagsTable.parentId, parentId));
  }

  /**
   * 获取顶级标签（无父标签）
   */
  async getRootTags(): Promise<any[]> {
    return this.database.select()
      .from(memoryTagsTable)
      .where(eq(memoryTagsTable.parentId, null as any));
  }

  /**
   * 获取标签树（递归构建）
   */
  async getTagTree(): Promise<any[]> {
    const allTags = await this.database.select().from(memoryTagsTable);
    const rootTags = allTags.filter(t => t.parentId === null);

    function buildTree(parentId: number | null): any[] {
      return allTags
        .filter(t => t.parentId === parentId)
        .map(t => ({
          ...t,
          children: buildTree(t.id),
        }));
    }

    return buildTree(null);
  }

  /**
   * 搜索标签（名称模糊匹配）
   */
  async searchTags(query: string, limit: number = 10): Promise<any[]> {
    return this.database.select()
      .from(memoryTagsTable)
      .where(sql`${memoryTagsTable.name} LIKE ${'%' + query + '%'}`)
      .limit(limit);
  }

  /**
   * 获取某记忆的标签数量
   */
  async getTagCountForMemory(memoryId: number): Promise<number> {
    return this.database.$count(
      memoryTagRelationsTable,
      eq(memoryTagRelationsTable.memoryId, memoryId)
    );
  }
}
