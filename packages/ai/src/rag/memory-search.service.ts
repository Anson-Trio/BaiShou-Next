/**
 * MemorySearchService — 四路融合记忆搜索
 *
 * 搜索流程：
 * 1. 关键词匹配（title + tags 模糊 LIKE）
 * 2. 标签匹配（memory_tag_relations JOIN memory_tags）
 * 3. 向量语义（memory_embeddings.embedding 余弦相似度）
 * 4. 行动图传播（memory_actions 双向权重传播）
 *
 * 融合算法：Reciprocal Rank Fusion (RRF)
 */

import { sql, like, inArray } from 'drizzle-orm';
import {
  IMemorySearchResult,
  MemorySearchConfig,
  MemorySearchSource,
  MemoryScoreMode,
  DEFAULT_MEMORY_SEARCH_CONFIG,
  getWeightsForScoreMode,
  reciprocalRankFusion,
  KeywordSearchResult,
  TagSearchResult,
  VectorSearchResult,
  GraphSearchResult,
} from './memory-search.types';
import { memoryEmbeddingsTable } from '@baishou/database/src/schema/vectors';
import { memoryTagRelationsTable } from '@baishou/database/src/schema/memory-tags';
import { memoryTagsTable } from '@baishou/database/src/schema/memory-tags';
import { memoryActionsTable } from '@baishou/database/src/schema/memory-actions';
import { AppDatabase } from '@baishou/database/src/types';
import { MemoryActionsRepository } from '@baishou/database/src/repositories/memory-actions.repository';

export class MemorySearchService {
  private actionsRepo: MemoryActionsRepository;

  constructor(private readonly database: AppDatabase) {
    this.actionsRepo = new MemoryActionsRepository(database);
  }

  /**
   * 四路融合搜索入口
   */
  async search(
    queryText: string,
    queryVector: number[],
    config: Partial<MemorySearchConfig> = {}
  ): Promise<IMemorySearchResult[]> {
    const fullConfig: MemorySearchConfig = {
      ...DEFAULT_MEMORY_SEARCH_CONFIG,
      ...getWeightsForScoreMode(DEFAULT_MEMORY_SEARCH_CONFIG.scoreMode),
      ...config,
    };

    // 如果传入了 scoreMode，重新应用对应权重
    if (config.scoreMode && config.scoreMode !== DEFAULT_MEMORY_SEARCH_CONFIG.scoreMode) {
      const modeWeights = getWeightsForScoreMode(config.scoreMode);
      Object.assign(fullConfig, modeWeights);
    }

    // ── Step 1: 并行执行前三路搜索 ──
    const [keywordResults, tagResults, vectorResults] = await Promise.all([
      this.searchByKeyword(queryText, fullConfig),
      this.searchByTags(queryText, fullConfig),
      this.searchByVector(queryVector, fullConfig),
    ]);

    // ── Step 2: 行动图传播（依赖前三路结果） ──
    const graphResults = await this.propagateFromGraph(queryVector, keywordResults, vectorResults, fullConfig);

    // ── Step 2: RRF 融合 ──
    const rankedLists = [
      ...keywordResults.map((r, i) => ({ id: r.id, rank: i, weight: fullConfig.keywordWeight, source: 'keyword' as MemorySearchSource })),
      ...tagResults.map((r, i) => ({ id: r.id, rank: i, weight: fullConfig.tagWeight, source: 'tag' as MemorySearchSource })),
      ...vectorResults.map((r, i) => ({ id: r.id, rank: i, weight: fullConfig.semanticWeight, source: 'vector' as MemorySearchSource })),
      ...graphResults.map((r, i) => ({ id: r.id, rank: i, weight: fullConfig.graphWeight, source: 'graph' as MemorySearchSource })),
    ];

    const fusedScores = reciprocalRankFusion(rankedLists);

    // ── Step 3: 按融合分数排序并返回 ──
    const sortedIds = Array.from(fusedScores.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .filter(([id, { score }]) => score >= fullConfig.relevanceThreshold)
      .slice(0, fullConfig.limit)
      .map(([id]) => id);

    if (sortedIds.length === 0) return [];

    // ── Step 4: 补充完整记忆信息 ──
    const memories = await this.fetchMemoryDetails(sortedIds, fusedScores, fullConfig);

    return memories;
  }

  // ── 第一路：关键词匹配 ──────────────────────────────────────

  /**
   * 搜索 title + tags 模糊匹配
   */
  async searchByKeyword(
    query: string,
    config: MemorySearchConfig
  ): Promise<KeywordSearchResult[]> {
    if (!query.trim()) return [];

    const keyword = `%${query}%`;
    const baseQuery = this.database
      .select({
        id: memoryEmbeddingsTable.id,
        embeddingId: memoryEmbeddingsTable.embeddingId,
        title: memoryEmbeddingsTable.title,
        chunkText: memoryEmbeddingsTable.chunkText,
        tags: memoryEmbeddingsTable.tags,
      })
      .from(memoryEmbeddingsTable)
      .where(sql`(
        ${memoryEmbeddingsTable.title} LIKE ${keyword}
        OR ${memoryEmbeddingsTable.tags} LIKE ${keyword}
      )`)
      .limit(config.topK);

    let results: any[];
    if (config.folderPath) {
      results = await baseQuery.where(sql`${memoryEmbeddingsTable.folderPath} = ${config.folderPath}`);
    } else {
      results = await baseQuery;
    }

    return results.map((r, i) => ({
      id: r.id,
      embeddingId: r.embeddingId,
      title: r.title,
      chunkText: r.chunkText,
      tags: r.tags,
      rank: i,
      score: 1.0 / (i + 1), // 简化分数：排名越高分数越高
    }));
  }

  // ── 第二路：标签匹配 ───────────────────────────────────────

  /**
   * 通过 memory_tag_relations 查找相关记忆
   */
  async searchByTags(
    query: string,
    config: MemorySearchConfig
  ): Promise<TagSearchResult[]> {
    if (!query.trim()) return [];

    // 先找到匹配标签名的 tag IDs
    const matchedTags = await this.database
      .select({ id: memoryTagsTable.id, name: memoryTagsTable.name })
      .from(memoryTagsTable)
      .where(like(memoryTagsTable.name, `%${query}%`))
      .limit(config.topK);

    if (matchedTags.length === 0) return [];

    const tagIds = matchedTags.map(t => t.id);

    // 再通过 memory_tag_relations 找到关联的记忆
    const memoryIds = await this.database
      .select({ memoryId: memoryTagRelationsTable.memoryId })
      .from(memoryTagRelationsTable)
      .where(inArray(memoryTagRelationsTable.tagId, tagIds))
      .groupBy(memoryTagRelationsTable.memoryId)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(config.topK);

    if (memoryIds.length === 0) return [];

    const ids = memoryIds.map(m => m.memoryId);

    // 获取记忆详情
    const memories = await this.database
      .select({
        id: memoryEmbeddingsTable.id,
        embeddingId: memoryEmbeddingsTable.embeddingId,
        title: memoryEmbeddingsTable.title,
        tags: memoryEmbeddingsTable.tags,
      })
      .from(memoryEmbeddingsTable)
      .where(inArray(memoryEmbeddingsTable.id, ids));

    // 按 ids 顺序保持一致
    const sortedMemories = ids.map(id => memories.find(m => m.id === id)).filter(Boolean);

    return sortedMemories.map((m: any, i) => ({
      id: m!.id,
      embeddingId: m!.embeddingId,
      title: m!.title,
      tagNames: matchedTags.filter(t => m!.tags?.includes(t.name)).map(t => t.name),
      rank: i,
      score: 1.0 / (i + 1),
    }));
  }

  // ── 第三路：向量语义搜索 ──────────────────────────────────

  /**
   * 向量相似度搜索（使用 memory_embeddings 表）
   */
  async searchByVector(
    queryVector: number[],
    config: MemorySearchConfig
  ): Promise<VectorSearchResult[]> {
    if (!queryVector || queryVector.length === 0) return [];

    try {
      // 序列化查询向量
      const vectorBuffer = Buffer.from(new Float32Array(queryVector).buffer);

      let baseQuery = this.database
        .select({
          id: memoryEmbeddingsTable.id,
          embeddingId: memoryEmbeddingsTable.embeddingId,
          title: memoryEmbeddingsTable.title,
          chunkText: memoryEmbeddingsTable.chunkText,
          distance: sql<number>`vec_distance_cosine(${memoryEmbeddingsTable.embedding}, ${vectorBuffer})`.as('distance'),
        })
        .from(memoryEmbeddingsTable)
        .orderBy(sql`vec_distance_cosine(${memoryEmbeddingsTable.embedding}, ${vectorBuffer}) ASC`)
        .limit(config.topK);

      // 添加 folderPath 过滤
      if (config.folderPath) {
        baseQuery = baseQuery.where(sql`${memoryEmbeddingsTable.folderPath} = ${config.folderPath}`) as any;
      }

      // 添加 sourceType 过滤
      if (config.sourceType) {
        baseQuery = baseQuery.where(sql`${memoryEmbeddingsTable.sourceType} = ${config.sourceType}`) as any;
      }

      const results = await baseQuery;

      return results.map((r: any, i: number) => ({
        id: r.id,
        embeddingId: r.embeddingId,
        title: r.title,
        chunkText: r.chunkText,
        rank: i,
        score: Math.max(0, 1.0 - r.distance), // distance 0 = 完全相似，转换为 1 = 完全相似
      }));
    } catch (e) {
      // 如果向量搜索失败，返回空（降级策略）
      console.warn('[MemorySearch] 向量搜索失败:', e);
      return [];
    }
  }

  // ── 第四路：行动图传播 ────────────────────────────────────

  /**
   * 从向量搜索结果出发，通过 memory_actions 双向传播分数
   *
   * 正向传播：从 triggerMemory → targetMemory
   * 逆向传播：从 targetMemory ← triggerMemory
   */
  async propagateFromGraph(
    _queryVector: number[],
    keywordResults: KeywordSearchResult[],
    vectorResults: VectorSearchResult[],
    config: MemorySearchConfig
  ): Promise<GraphSearchResult[]> {
    // 以向量搜索结果为主要种子（因为有真实相关性分数）
    const seedResults = vectorResults.length > 0 ? vectorResults : keywordResults;
    if (seedResults.length === 0) return [];

    const scored = new Map<number, number>();

    // 初始化种子分数
    for (const r of seedResults) {
      scored.set(r.id, r.score * config.graphWeight);
    }

    // 从每个种子记忆出发，传播到关联记忆
    for (const seed of seedResults.slice(0, config.topK)) {
      // 正向传播（该记忆作为 trigger）
      const triggerActions = await this.actionsRepo.getActionsByTriggerMemoryId(seed.id, { limit: 10 });
      for (const action of triggerActions) {
        const current = scored.get(action.targetMemoryId) ?? 0;
        scored.set(action.targetMemoryId, current + seed.score * action.weight * config.graphWeight);
      }

      // 逆向传播（该记忆作为 target / backlinks）
      const targetActions = await this.actionsRepo.getActionsByTargetMemoryId(seed.id, { limit: 10 });
      for (const action of targetActions) {
        const current = scored.get(action.triggerMemoryId) ?? 0;
        scored.set(action.triggerMemoryId, current + seed.score * action.weight * config.graphWeight);
      }
    }

    // 按分数排序并返回
    const sorted = Array.from(scored.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, config.topK);

    const ids = sorted.map(([id]) => id);
    if (ids.length === 0) return [];

    // 获取记忆详情
    const memories = await this.database
      .select({
        id: memoryEmbeddingsTable.id,
        embeddingId: memoryEmbeddingsTable.embeddingId,
        title: memoryEmbeddingsTable.title,
      })
      .from(memoryEmbeddingsTable)
      .where(inArray(memoryEmbeddingsTable.id, ids));

    const memoryMap = new Map(memories.map(m => [m.id, m]));

    return sorted.map(([id, propagatedScore], i) => {
      const m = memoryMap.get(id);
      return {
        id,
        embeddingId: m?.embeddingId ?? '',
        title: m?.title ?? '',
        rank: i,
        propagatedScore,
        source: 'trigger' as const, // 这里简化了，实际可区分 trigger/target
      };
    });
  }

  // ── 补充记忆详情 ──────────────────────────────────────────

  /**
   * 根据 ID 列表获取完整记忆信息，并附上关联的行动
   */
  private async fetchMemoryDetails(
    sortedIds: number[],
    fusedScores: Map<number, { score: number; sources: Set<MemorySearchSource> }>,
    config: MemorySearchConfig
  ): Promise<IMemorySearchResult[]> {
    if (sortedIds.length === 0) return [];

    const memories = await this.database
      .select()
      .from(memoryEmbeddingsTable)
      .where(inArray(memoryEmbeddingsTable.id, sortedIds));

    const memoryMap = new Map(memories.map(m => [m.id, m]));

    const results: IMemorySearchResult[] = [];

    for (const id of sortedIds) {
      const m = memoryMap.get(id);
      if (!m) continue;

      const { score, sources } = fusedScores.get(id)!;

      // 获取关联行动
      let relatedActions: IMemorySearchResult['relatedActions'] = undefined;
      if (config.hasActions) {
        const [triggerActions, targetActions] = await Promise.all([
          this.actionsRepo.getActionsByTriggerMemoryId(id, { limit: 5 }),
          this.actionsRepo.getActionsByTargetMemoryId(id, { limit: 5 }),
        ]);
        relatedActions = [...triggerActions, ...targetActions].map(a => ({
          actionType: a.actionType,
          description: a.description,
          weight: a.weight,
        }));
      }

      // 获取 action count
      const { asTrigger, asTarget } = await this.actionsRepo.getActionCountForMemory(id);

      // 确定主要来源
      const primarySource = this.determinePrimarySource(sources, m);

      results.push({
        id: m.id,
        embeddingId: m.embeddingId,
        title: m.title,
        content: m.content,
        contentType: m.contentType,
        source: m.source,
        importance: m.importance,
        credibility: m.credibility,
        folderPath: m.folderPath ?? null,
        tags: m.tags,
        chunkText: m.chunkText,
        score,
        primarySource,
        actionCount: asTrigger + asTarget,
        lastAccessedAt: m.lastAccessedAt,
        createdAt: m.createdAt,
        relatedActions,
      });
    }

    return results;
  }

  /**
   * 根据来源集合确定主要来源
   */
  private determinePrimarySource(
    sources: Set<MemorySearchSource>,
    _memory: any
  ): MemorySearchSource {
    // 优先级：vector > keyword > tag > graph
    if (sources.has('vector')) return 'vector';
    if (sources.has('keyword')) return 'keyword';
    if (sources.has('tag')) return 'tag';
    if (sources.has('graph')) return 'graph';
    return 'fusion';
  }
}
