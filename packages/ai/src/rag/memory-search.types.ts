/**
 * Memory Search — 四路融合搜索类型定义
 *
 * 四路融合：
 * 1. Keyword  — 标题 + tags 模糊匹配
 * 2. Tag      — 标签关联匹配（memory_tag_relations）
 * 3. Vector   — 向量语义相似度（memory_embeddings.embedding）
 * 4. Graph    — 行动关联双向传播（memory_actions）
 */

import { MemoryActionType } from '@baishou/database/src/schema/memory-actions';

// ── Search Result ────────────────────────────────────────────

export type MemorySearchSource = 'keyword' | 'tag' | 'vector' | 'graph' | 'fusion';

export interface IMemorySearchResult {
  id: number;
  embeddingId: string;
  title: string;
  content: string;
  contentType: string;
  source: string;
  importance: number;
  credibility: number;
  folderPath: string | null;
  tags: string;
  chunkText: string;
  score: number;
  primarySource: MemorySearchSource;
  actionCount?: number;
  lastAccessedAt?: Date;
  createdAt?: Date;
  // 关联的行动信息（如果有）
  relatedActions?: {
    actionType: MemoryActionType;
    description: string;
    weight: number;
  }[];
}

// ── Search Configuration ─────────────────────────────────────

export enum MemoryScoreMode {
  BALANCED = 'balanced',       // 均衡模式
  KEYWORD_FIRST = 'keyword',    // 关键词优先
  SEMANTIC_FIRST = 'semantic', // 语义优先
  GRAPH_FIRST = 'graph',        // 行动关联优先
}

export interface MemorySearchConfig {
  /** 评分模式 */
  scoreMode: MemoryScoreMode;
  /** 关键词权重（title + tags 匹配） */
  keywordWeight: number;
  /** 标签匹配权重 */
  tagWeight: number;
  /** 向量语义权重 */
  semanticWeight: number;
  /** 行动图关联权重 */
  graphWeight: number;
  /** 召回数量上限（每路） */
  topK: number;
  /** 最终返回数量 */
  limit: number;
  /** 相关性阈值（低于此分数不返回） */
  relevanceThreshold: number;
  /** folderPath 筛选（null = 不过滤） */
  folderPath?: string | null;
  /** sourceType 筛选 */
  sourceType?: string;
  /** 只返回有 action 关联的记忆 */
  hasActions?: boolean;
  /** 行动关联的最大跳数（目前固定 1） */
  graphDepth?: number;
}

/** 默认搜索配置 */
export const DEFAULT_MEMORY_SEARCH_CONFIG: MemorySearchConfig = {
  scoreMode: MemoryScoreMode.BALANCED,
  keywordWeight: 0.3,
  tagWeight: 0.2,
  semanticWeight: 0.3,
  graphWeight: 0.2,
  topK: 20,
  limit: 10,
  relevanceThreshold: 0.025,
  graphDepth: 1,
};

/** 根据 scoreMode 返回预设权重 */
export function getWeightsForScoreMode(mode: MemoryScoreMode): Pick<MemorySearchConfig, 'keywordWeight' | 'tagWeight' | 'semanticWeight' | 'graphWeight'> {
  switch (mode) {
    case MemoryScoreMode.KEYWORD_FIRST:
      return { keywordWeight: 0.5, tagWeight: 0.2, semanticWeight: 0.2, graphWeight: 0.1 };
    case MemoryScoreMode.SEMANTIC_FIRST:
      return { keywordWeight: 0.15, tagWeight: 0.15, semanticWeight: 0.5, graphWeight: 0.2 };
    case MemoryScoreMode.GRAPH_FIRST:
      return { keywordWeight: 0.1, tagWeight: 0.1, semanticWeight: 0.3, graphWeight: 0.5 };
    case MemoryScoreMode.BALANCED:
    default:
      return { keywordWeight: 0.3, tagWeight: 0.2, semanticWeight: 0.3, graphWeight: 0.2 };
  }
}

// ── RRF Fusion ──────────────────────────────────────────────

/**
 * Reciprocal Rank Fusion (RRF)
 *
 * 多路搜索结果融合算法：
 * RRF_score(d) = Σ 1/(k + rank_i(d))
 *
 * 其中 k 为常量（默认 60），rank_i(d) 为结果 d 在第 i 路的排名
 */
export function reciprocalRankFusion(
  rankedLists: Array<{ id: number; rank: number; weight: number; source: MemorySearchSource }>,
  k: number = 60
): Map<number, { score: number; sources: Set<MemorySearchSource> }> {
  const scores = new Map<number, { score: number; sources: Set<MemorySearchSource> }>();

  for (const item of rankedLists) {
    const { id, rank, weight, source } = item;
    const rrf = weight / (k + rank);

    if (!scores.has(id)) {
      scores.set(id, { score: 0, sources: new Set() });
    }
    const entry = scores.get(id)!;
    entry.score += rrf;
    entry.sources.add(source);
  }

  return scores;
}

// ── Partial Result Types ────────────────────────────────────

export interface KeywordSearchResult {
  id: number;
  embeddingId: string;
  title: string;
  chunkText: string;
  tags: string;
  rank: number;
  score: number;
}

export interface TagSearchResult {
  id: number;
  embeddingId: string;
  title: string;
  tagNames: string[];
  rank: number;
  score: number;
}

export interface VectorSearchResult {
  id: number;
  embeddingId: string;
  title: string;
  chunkText: string;
  rank: number;
  score: number; // 0-1 cosine similarity
}

export interface GraphSearchResult {
  id: number;
  embeddingId: string;
  title: string;
  rank: number;
  propagatedScore: number;
  source: 'trigger' | 'target';
}
