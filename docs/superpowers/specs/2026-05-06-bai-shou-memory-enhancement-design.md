# BaiShou-Next 记忆系统增强方案

**版本：** v1.0
**日期：** 2026-05-06
**状态：** 已批准
**对应项目：** BaiShou-Next (`/mnt/f/github/BaiShou-Next`)

---

## 一、目标

追平 Operit 记忆系统完成度（58% → 65%），同时在 actionType 枚举、与 Vault/MCP 耦合上形成 BaiShou-Next 差异化优势。

核心原则：
- 记忆系统以"你"为中心（真正的 AI 伴侣定位）
- 记忆属于用户（本地存储优先）
- "靠得住"优于"搜得到"（可验证性驱动）

---

## 二、方案概述

三层记忆结构：

```
第一层：记忆主体（memory_embeddings 扩展）
    ├── importance / credibility 元数据
    ├── folderPath 文件夹组织
    └── tags 标签体系

第二层：行动关联（memory_actions 双向）
    ├── triggerMemoryId → targetMemoryId
    ├── actionType 枚举
    └── weight 关联强度

第三层：搜索融合（内部实现）
    ├── 关键词匹配
    ├── 标签匹配
    ├── 向量语义搜索
    └── Graph 传播（双向）
```

---

## 三、数据库 Schema 变更

### 3.1 memory_embeddings 表扩展（新增字段）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `title` | TEXT | '' | 记忆标题 |
| `content` | TEXT | '' | 详细内容 |
| `content_type` | TEXT | 'text/plain' | 内容类型 |
| `source` | TEXT | 'unknown' | 来源：user_input / ai_response / action_result |
| `importance` | REAL | 0.5 | 重要性 0.0-1.0 |
| `credibility` | REAL | 0.5 | 可信度 0.0-1.0 |
| `folder_path` | TEXT (nullable, indexed) | NULL | 文件夹路径，null=根目录 |
| `tags` | TEXT | '' | 逗号分隔标签 |
| `last_accessed_at` | TIMESTAMP | CURRENT_TIMESTAMP | 最后访问时间 |

**迁移策略：** ALTER TABLE 追加新列，原有数据 importance/credibility 默认为 0.5，folder_path 默认为 null。

### 3.2 memory_actions 表（新建）

```sql
CREATE TABLE memory_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_memory_id INTEGER NOT NULL,
  target_memory_id INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 0.7,
  description TEXT DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trigger_memory_id) REFERENCES memory_embeddings(id),
  FOREIGN KEY (target_memory_id) REFERENCES memory_embeddings(id)
);

CREATE INDEX idx_action_trigger ON memory_actions(trigger_memory_id);
CREATE INDEX idx_action_target ON memory_actions(target_memory_id);
```

**action_type 枚举值：**

| 值 | 说明 |
|----|------|
| `data_analysis` | 数据分析类工具调用结果 |
| `weather_check` | 天气查询结果 |
| `document_review` | 文档分析结果 |
| `summary_generated` | 摘要生成结果 |
| `reflection` | AI 反思/总结 |
| `search_result` | 搜索结果呈现 |
| `preference_update` | 偏好更新 |
| `reminder_sent` | 提醒已发送 |

**weight 常量：**

| 常量 | 值 | 说明 |
|------|-----|------|
| STRONG_LINK | 1.0 | 强关联 |
| MEDIUM_LINK | 0.7 | 中等关联 |
| WEAK_LINK | 0.3 | 弱关联 |

### 3.3 memory_tags 表（新建）

```sql
CREATE TABLE memory_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  parent_id INTEGER,
  FOREIGN KEY (parent_id) REFERENCES memory_tags(id)
);

CREATE TABLE memory_tag_relations (
  memory_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (memory_id, tag_id),
  FOREIGN KEY (memory_id) REFERENCES memory_embeddings(id),
  FOREIGN KEY (tag_id) REFERENCES memory_tags(id)
);
```

---

## 四、搜索流程

### 4.1 四路融合算法

```typescript
async function searchMemories(
  query: string,
  folderPath?: string,
  config: SearchConfig
): Promise<Memory[]> {
  // 1. 关键词匹配（标题 + tags）
  const keywordResults = await searchByTitleAndTags(query, folderPath);

  // 2. 标签匹配
  const tagResults = await searchByTags(query, folderPath);

  // 3. 向量语义搜索
  const semanticResults = await searchByVector(query, folderPath);

  // 4. Graph 传播（双向）
  const graphResults = await propagateFromGraph(
    semanticResults,
    keywordResults,
    config.edgeWeight
  );

  // 5. RRF 融合
  return rrfFusion(
    keywordResults,   // weight: config.keywordWeight
    tagResults,       // weight: config.tagWeight
    semanticResults,   // weight: config.semanticWeight
    graphResults,      // weight: config.edgeWeight
    config.topK
  );
}
```

### 4.2 Graph 传播（双向）

```typescript
// 正向传播：从 triggerMemory 出发
triggerMemory.actions.forEach(action => {
  const propagated = sourceScore * action.weight * GRAPH_WEIGHT;
  scores[action.targetMemoryId] += propagated;
});

// 逆向传播：从 targetMemory 的 backlinks 出发
targetMemory.backlinks.forEach(link => {
  const propagated = sourceScore * link.weight * GRAPH_WEIGHT;
  scores[link.triggerMemoryId] += propagated;
});
```

### 4.3 搜索配置

```typescript
enum MemoryScoreMode {
  BALANCED,        // 均衡模式
  KEYWORD_FIRST,   // 关键词优先 (1.3x keyword, 0.8x semantic)
  SEMANTIC_FIRST   // 语义优先 (0.8x keyword, 1.3x semantic)
}

interface SearchConfig {
  scoreMode: MemoryScoreMode;
  keywordWeight: Float;
  tagWeight: Float;
  semanticWeight: Float;
  edgeWeight: Float;      // 默认 0.4
  relevanceThreshold: Float; // 默认 0.025
}
```

---

## 五、Action 写入时机

### 5.1 MCP Tool 调用完成后

当 AI 通过 MCP 工具完成用户请求时，自动记录 MemoryAction：

```
用户："帮我分析一下Q2的销售数据"
    ↓
AI 调用 MCP tool: `sales_analysis`
    ↓
tool 返回分析结果
    ↓
自动创建：
  - Memory(target): Q2销售分析结果
  - MemoryAction {
      triggerMemoryId: 用户说"分析Q2销售"那条记忆,
      targetMemoryId: Q2销售分析结果,
      actionType: 'data_analysis',
      description: '帮你跑了销售数据，发现Q2异常波动'
    }
```

### 5.2 搜索结果返回时

当 AI 因用户问题检索记忆并返回结果时：

```
用户："你上周帮我分析过什么？"
    ↓
向量检索匹配到记忆A(销售分析)
    ↓
若记忆A有 MemoryAction 关联
    ↓
AI 回复时引用 MemoryAction.description
```

### 5.3 摘要生成时

当 weekly/monthly/yearly 摘要生成后：

```
摘要生成完成
    ↓
创建 MemoryAction {
      triggerMemoryId: 相关日记的记忆IDs,
      targetMemoryId: 生成的摘要记忆,
      actionType: 'summary_generated'
    }
```

---

## 六、与 Operit 的核心差异

| 方面 | BaiShou-Next | Operit |
|------|---------------|--------|
| **关联语义** | MemoryAction（AI 行动追踪） | MemoryLink（通用关系） |
| **actionType** | ✅ 枚举类型（明确） | ❌ 通用 String |
| **与 Vault 协同** | ✅ 记忆快照可导出到 Vault | ❌ 独立 ObjectBox |
| **与 MCP 耦合** | ✅ tool_call 结果自动入 Action | ❌ 无 |
| **摘要系统** | ✅ weekly/monthly/yearly Summaries | ❌ 无 |
| **中文分词** | ⚠️ 待做（Jieba） | ✅ Jieba |

---

## 七、实现优先级

| 优先级 | 功能 | 工作量 | 依赖 |
|---------|------|--------|------|
| P0 | memory_embeddings 表扩展（新增字段） | 小 | 无 |
| P0 | memory_actions 表 + CRUD | 中 | P0 |
| P0 | memory_tags 表 + CRUD | 中 | P0 |
| P1 | 四路搜索融合 | 大 | P0+P1 |
| P1 | SearchConfig + ScoreMode | 小 | P0 |
| P2 | folderPath 管理 UI（批量重命名） | 中 | P0 |
| P2 | Jieba 中文分词 | 中 | P1 |
| P3 | 行动面板 UI（"她为你做过什么"） | 大 | P1 |
| P3 | 图谱可视化 | 大 | P2 |

---

## 八、风险与备选

| 风险 | 缓解措施 |
|------|---------|
| memory_embeddings 表 ALTER 迁移失败 | 先备份数据库，做影子表迁移 |
| Action 写入时机不准确 | 提供手动创建/删除 Action 的 API |
| 图传播分数影响搜索准确性 | relevanceThreshold 兜底，默认过滤低分 |

---

## 九、验收标准

1. ✅ `memory_embeddings` 表成功新增所有字段，原有数据不丢失
2. ✅ `memory_actions` 表支持双向 CRUD
3. ✅ 四路搜索返回结果相关性高于现有纯向量搜索
4. ✅ folderPath 支持按文件夹筛选
5. ✅ 用户可查看"她为你做过的事"列表
6. ✅ 搜索配置支持 BALANCED/KEYWORD_FIRST/SEMANTIC_FIRST 三模式
