import { ipcMain } from 'electron';
import { SleepDreamsRepository } from '@baishou/database/src/repositories/sleep-dreams.repository';
import { MemoryRepository } from '@baishou/database/src/repositories/memory.repository';
import { SleepService, SleepAiClient, ConversationContext } from '@baishou/core/src/dreams/sleep.service';
import { getAppDb, connectionManager } from '../db';
import { generateText } from 'ai';
import { getActiveProvider } from './agent-helpers';
import { settingsManager } from './settings.ipc';
import { GlobalModelsConfig } from '@baishou/shared';

/**
 * 获取 SleepService 实例
 * 懒加载模式，每次调用时创建新实例
 */
function getSleepService(): SleepService {
  const db = getAppDb();
  const dreamsRepo = new SleepDreamsRepository(db);
  const memoryRepo = new MemoryRepository(db);

  const aiClient: SleepAiClient = {
    async generateContent(prompt: string, modelId?: string): Promise<string> {
      const provider = await getActiveProvider();
      const globalModels = await settingsManager.get<GlobalModelsConfig>('global_models');
      
      const modelIdToUse = globalModels?.globalSummaryModelId || modelId || 'deepseek-chat';
      const model = provider.getLanguageModel(modelIdToUse);
      
      const { text } = await generateText({
        model,
        prompt,
        maxSteps: 1
      });
      return text;
    }
  };

  return new SleepService(dreamsRepo, memoryRepo, aiClient);
}

/**
 * Dreams IPC — 睡眠梦境查询接口
 *
 * 核心查询：
 * 1. 获取某日的梦境
 * 2. 获取日期范围的梦境
 * 3. 获取最近的梦境
 * 4. 删除梦境
 * 5. Consolidation（Light/Deep/REM 阶段处理）
 */
export function registerDreamsIPC(): void {

  /**
   * 获取某日的所有梦境
   */
  ipcMain.handle('dreams:get-by-date', async (_, date: string, phase?: string) => {
    const db = getAppDb();
    const repo = new SleepDreamsRepository(db);
    return repo.findByDateAndPhase(date, phase as any);
  });

  /**
   * 按日期范围查询梦境
   */
  ipcMain.handle('dreams:get-by-range', async (_, startDate: string, endDate: string, phase?: string) => {
    const db = getAppDb();
    const repo = new SleepDreamsRepository(db);
    const dreams = await repo.findByDateRange(startDate, endDate);
    if (phase) {
      return dreams.filter(d => d.phase === phase);
    }
    return dreams;
  });

  /**
   * 获取最近的梦境
   */
  ipcMain.handle('dreams:get-recent', async (_, limit?: number) => {
    const db = getAppDb();
    const repo = new SleepDreamsRepository(db);
    return repo.findRecent(limit ?? 20);
  });

  /**
   * 删除梦境
   */
  ipcMain.handle('dreams:delete', async (_, dreamId: string) => {
    const db = getAppDb();
    const repo = new SleepDreamsRepository(db);
    await repo.delete(dreamId);
    return { success: true };
  });

  /**
   * 统计各阶段梦境数量
   */
  ipcMain.handle('dreams:count-by-phase', async () => {
    const db = getAppDb();
    const repo = new SleepDreamsRepository(db);
    const light = await repo.countByPhase('light');
    const deep = await repo.countByPhase('deep');
    const rem = await repo.countByPhase('rem');
    return { light, deep, rem };
  });

  /**
   * 获取所有有梦境的日期列表
   */
  ipcMain.handle('dreams:get-all-dates', async () => {
    const db = getAppDb();
    const repo = new SleepDreamsRepository(db);
    return repo.getAllDates();
  });

  // ── Consolidation 阶段 ─────────────────────────────────────

  /**
   * Light Phase：对对话进行快速反思整理
   *
   * @param conversation 对话上下文（日期 + 消息列表）
   * @returns dreamId 生成的梦境 ID
   */
  ipcMain.handle('dreams:consolidate-light', async (_, conversation: ConversationContext) => {
    const service = getSleepService();
    const dreamId = await service.consolidateLightMemory(conversation);
    return { success: true, dreamId };
  });

  /**
   * Deep Phase：对某日的 Light 梦境进行重要度评分
   *
   * @param date 日期（YYYY-MM-DD）
   * @returns dreamId 更新的梦境 ID
   */
  ipcMain.handle('dreams:consolidate-deep', async (_, date: string) => {
    const service = getSleepService();
    const dreamId = await service.consolidateDeepMemory(date);
    return { success: true, dreamId };
  });

  /**
   * REM Phase：对日期范围内的 Deep 梦境进行主题聚类
   *
   * @param startDate 开始日期（YYYY-MM-DD）
   * @param endDate 结束日期（YYYY-MM-DD）
   * @returns dreamId 生成的 REM 梦境 ID
   */
  ipcMain.handle('dreams:consolidate-rem', async (_, startDate: string, endDate: string) => {
    const service = getSleepService();
    const dreamId = await service.consolidateREM(startDate, endDate);
    return { success: true, dreamId };
  });

  console.log('[Dreams IPC] registered');
}
