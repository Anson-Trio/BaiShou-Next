import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SleepService, ConversationContext, SleepAiClient } from '../sleep.service';

// Mock database deps
vi.mock('better-sqlite3', () => ({ default: class {} }));
vi.mock('drizzle-orm/better-sqlite3', () => ({ drizzle: () => ({}) }));

describe('SleepService', () => {
  // 模拟的 AI Client
  const mockAiClient: SleepAiClient = {
    async generateContent(prompt: string): Promise<string> {
      // 模拟 AI 返回一个简单的反思内容
      return `【反思摘要】
今天讨论了关于 AI 记忆功能的话题。

反思：用户希望测试记忆巩固功能，AI 需要生成简短的反思摘要。

标签：学习,技术
主题：AI,记忆
`;
    }
  };

  // 模拟的 Dreams Repository
  const mockDreamsRepo = {
    findByDateAndPhase: vi.fn().mockResolvedValue([]),
    findByDateRange: vi.fn().mockResolvedValue([]),
    findRecent: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockResolvedValue(1),
    updateContent: vi.fn().mockResolvedValue(undefined),
    updateInsightScore: vi.fn().mockResolvedValue(undefined),
    addRelatedMemory: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    countByPhase: vi.fn().mockResolvedValue(0),
    getAllDates: vi.fn().mockResolvedValue([]),
  };

  // 模拟的 Memory Repository
  const mockMemoryRepo = {
    findByKeyword: vi.fn().mockResolvedValue([
      { id: 1, embeddingId: 'emb-1', sourceId: 'src-1', title: '测试记忆', content: '测试内容', tags: '测试' }
    ]),
  };

  let service: SleepService;

  beforeEach(() => {
    service = new SleepService(
      mockDreamsRepo as any,
      mockMemoryRepo as any,
      mockAiClient
    );
    vi.clearAllMocks();
  });

  describe('Light Phase - consolidateLightMemory', () => {
    it('应该能创建新的 Light 梦境', async () => {
      const conversation: ConversationContext = {
        date: '2026-01-06',
        messages: [
          { role: 'user', content: '你好，我想测试记忆功能', timestamp: new Date() },
          { role: 'assistant', content: '好的，我来帮你测试', timestamp: new Date() }
        ]
      };

      mockDreamsRepo.findByDateAndPhase.mockResolvedValue([]);

      const dreamId = await service.consolidateLightMemory(conversation);

      expect(dreamId).toBeDefined();
      expect(typeof dreamId).toBe('string');
      expect(dreamId).toContain('dream_');
      expect(dreamId).toContain('light');
      expect(mockDreamsRepo.insert).toHaveBeenCalled();
    });

    it('应该更新已存在的 Light 梦境', async () => {
      const conversation: ConversationContext = {
        date: '2026-01-06',
        messages: [
          { role: 'user', content: '你好', timestamp: new Date() }
        ]
      };

      const existingDream = { dreamId: 'dream_2026-01-06_light_123', phase: 'light' };
      mockDreamsRepo.findByDateAndPhase.mockResolvedValue([existingDream]);

      const dreamId = await service.consolidateLightMemory(conversation);

      expect(dreamId).toBe('dream_2026-01-06_light_123');
      expect(mockDreamsRepo.updateContent).toHaveBeenCalled();
    });
  });

  describe('Deep Phase - consolidateDeepMemory', () => {
    it('应该能为 Light 梦境计算重要度评分', async () => {
      mockDreamsRepo.findByDateAndPhase
        .mockResolvedValueOnce([]) // consolidateLightMemory
        .mockResolvedValueOnce([{
          dreamId: 'dream_2026-01-06_light_1',
          content: '这是一个测试反思内容',
          title: '测试'
        }]); // consolidateDeepMemory

      // Mock insert for light phase
      mockDreamsRepo.insert.mockResolvedValue(1);

      const dreamId = await service.consolidateDeepMemory('2026-01-06');

      expect(dreamId).toBeDefined();
      expect(typeof dreamId).toBe('string');
      expect(dreamId).toContain('deep');
    });

    it('应该抛出错误当没有 Light 梦境时', async () => {
      mockDreamsRepo.findByDateAndPhase.mockResolvedValue([]);

      await expect(service.consolidateDeepMemory('2026-01-06'))
        .rejects.toThrow('No light dreams found');
    });
  });

  describe('REM Phase - consolidateREM', () => {
    it('应该聚合多个 Deep 梦境生成洞察', async () => {
      mockDreamsRepo.findByDateRange.mockResolvedValue([
        { dreamId: 'd1', content: '内容1', title: '标题1', insightScore: 0.8 },
        { dreamId: 'd2', content: '内容2', title: '标题2', insightScore: 0.6 }
      ]);

      const dreamId = await service.consolidateREM('2026-01-01', '2026-01-07');

      expect(dreamId).toBeDefined();
      expect(dreamId).toContain('rem');
      expect(mockAiClient.generateContent).toHaveBeenCalled();
    });

    it('应该抛出错误当没有 Deep 梦境时', async () => {
      mockDreamsRepo.findByDateRange.mockResolvedValue([]);

      await expect(service.consolidateREM('2026-01-01', '2026-01-07'))
        .rejects.toThrow('No deep dreams found');
    });
  });

  describe('Query - queryDreams', () => {
    it('应该能查询最近的梦境', async () => {
      const recentDreams = [
        { dreamId: 'd1', phase: 'light' },
        { dreamId: 'd2', phase: 'deep' }
      ];
      mockDreamsRepo.findRecent.mockResolvedValue(recentDreams);

      const results = await service.queryDreams({ limit: 10 });

      expect(results).toHaveLength(2);
      expect(mockDreamsRepo.findRecent).toHaveBeenCalledWith(10);
    });

    it('应该能按日期范围查询梦境', async () => {
      mockDreamsRepo.findByDateRange.mockResolvedValue([]);

      await service.queryDreams({ startDate: '2026-01-01', endDate: '2026-01-07' });

      expect(mockDreamsRepo.findByDateRange).toHaveBeenCalledWith('2026-01-01', '2026-01-07');
    });
  });

  describe('Delete - deleteDream', () => {
    it('应该能删除梦境', async () => {
      await service.deleteDream('dream_123');

      expect(mockDreamsRepo.delete).toHaveBeenCalledWith('dream_123');
    });
  });
});
