import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

/**
 * memory_tags — 层级标签表
 *
 * 支持层级标签（parent_id 自引用）：
 * - 顶级标签：parent_id = NULL
 * - 子标签：parent_id = 父标签 ID
 */
export const memoryTagsTable = sqliteTable('memory_tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  parentId: integer('parent_id'),
});

/**
 * memory_tag_relations — 记忆-标签关联表
 *
 * 多对多关系：一条记忆可以有多个标签，一个标签可以关联多条记忆
 */
export const memoryTagRelationsTable = sqliteTable('memory_tag_relations', {
  memoryId: integer('memory_id').notNull(),
  tagId: integer('tag_id').notNull(),
});
