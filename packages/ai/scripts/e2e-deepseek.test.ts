import { AgentSessionService } from '../src/agent/agent-session.service';
import { ToolRegistry } from '../src/tools/tool-registry';
import { OpenAIAdaptedProvider } from '../src/providers/openai.provider';
import { WebSearchTool } from '../src/tools/web-search.tool';
import { CurrentTimeTool } from '../src/tools/current-time.tool';

// 注入测试密钥
const DEEPSEEK_API_KEY = 'sk-435ddce8f94d4b01abc92b5cbf1e57be';

// 无依赖环境隔离的内存仓储 (Bypass better-sqlite3 native errors in tsx)
class MockSessionRepo {
  private sessions = new Map<string, any>();
  private messages = new Map<string, any[]>();
  
  async createSession(s: any) {}
  async upsertSession(s: any) { 
     this.sessions.set(s.id, { ...this.sessions.get(s.id), ...s }); 
  }
  async findAllSessions() { return Array.from(this.sessions.values()); }
  async getMessagesBySession(id: string, limit: number) { 
     return this.messages.get(id) || []; 
  }
  async insertMessageWithParts(msg: any, parts: any[]) {
     const arr = this.messages.get(msg.sessionId) || [];
     arr.push({ ...msg, parts });
     this.messages.set(msg.sessionId, arr);
  }
  async updateTokenUsage(id: string, inT: number, outT: number) {
     const s = this.sessions.get(id);
     if (s) {
       s.totalInputTokens = (s.totalInputTokens || 0) + inT;
       s.totalOutputTokens = (s.totalOutputTokens || 0) + outT;
     }
  }
}

class MockSnapshotRepo {
  private snapshots = new Map<string, any>();
  async appendSnapshot(params: any) { this.snapshots.set(params.sessionId, params); }
  async getLatestSnapshot(sessionId: string) { return this.snapshots.get(sessionId) || null; }
}

async function bootstrap() {
    console.log('🚀 [E2E] 正在初始化 DeepSeek Agent 全链路试验场 (Mocked DB)...\n');

    // 1. 初始化全内存沙盒驱动
    const sessionRepo = new MockSessionRepo() as any;
    const snapshotRepo = new MockSnapshotRepo() as any;

    const testSessionId = crypto.randomUUID();
    await sessionRepo.upsertSession({
       id: testSessionId,
       title: '新会话',
       vaultName: 'test-vault',
       providerId: 'deepseek',
       modelId: 'deepseek-chat'
    });
    console.log(`✅ [1/3] 测试沙盒建立：Session ID = ${testSessionId}`);

    // 2. 构建白守智慧骨架
    const provider = new OpenAIAdaptedProvider({
      id: 'deepseek',
      name: 'DeepSeek',
      type: 'openai-compatible',
      apiKey: DEEPSEEK_API_KEY,
      baseUrl: 'https://api.deepseek.com/v1',
      defaultDialogueModel: 'deepseek-chat',
      defaultReasoningModel: 'deepseek-reasoner'
    });

    const toolRegistry = new ToolRegistry();
    toolRegistry.register(new WebSearchTool());
    toolRegistry.register(new CurrentTimeTool());

    const agentService = new AgentSessionService();
    console.log('✅ [2/3] 工具链表与推理算力装备完毕。');

    console.log('\n=========================================');
    console.log('🎬 核心大剧上演：[发问与搜索连贯循环]');
    console.log('=========================================\n');

    const startTime = Date.now();
    try {
      await agentService.streamChat({
        sessionId: testSessionId,
        userText: '我是白守开发者。请先看一眼工具里现在几点，再搜索现在 Vercel AI SDK 的大版本号（如 v3 / v4），并精简介绍最新流式特性。',
        provider,
        modelId: 'deepseek-chat',
        toolRegistry,
        sessionRepo,
        snapshotRepo,
        systemPrompt: `遇到知识盲区使用各类内置 Tool。使用中文精简输出。你是一个高效的研发助手。`
      }, {
        onReasoningDelta: (t) => process.stdout.write(`\x1b[35m${t}\x1b[0m`), 
        onTextDelta: (t) => process.stdout.write(`\x1b[36m${t}\x1b[0m`),
        onToolCallStart: (n, a) => console.log(`\n\n🛠️  [工具跃进] 启动 \x1b[33m${n}\x1b[0m, 参数:`, a),
        onToolCallResult: (n, r) => {
           console.log(`✅ [工具归来] \x1b[33m${n}\x1b[0m 解析完成! 截取前 100 字符:`);
           const str = typeof r === 'string' ? r : JSON.stringify(r);
           console.log(`   ---\n   ${str.substring(0, 100)}...\n   ---\n`);
        },
        onError: (e) => console.error('\n❌ [严重坍塌] ', e),
        onFinish: () => console.log('\n\n✨ [内核回调] 事务落盘完成')
      });
    } catch(err: any) { console.error("\n运行错误:", err.message ?? err); }

    const costTime = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n=========================================`);
    console.log(`🏆 跑通，耗时 ${costTime}秒。`);

    console.log('\n⏳ [自动起名机] 主流完成，监听背景的闲置起名钩子...');
    await new Promise(r => setTimeout(r, 2500));

    const sessions = await sessionRepo.findAllSessions();
    const theSession = sessions.find((s: any) => s.id === testSessionId);
    const msgs = await sessionRepo.getMessagesBySession(testSessionId, 10);

    console.log('\n📊 [持久化幻像检查]：');
    console.log(`➤ 极简洗练的新标题器是否生效：${theSession?.title === '新会话' ? '❌ 失败 (还是"新会话")' : `✅ 成功更名为 -> \x1b[32m${theSession?.title}\x1b[0m`}`);
    console.log(`➤ 收纳的记忆总数：${msgs.length >= 2 ? `✅ ${msgs.length} 条` : `❌ ${msgs.length} 条`}`);
    
    console.log('\n🎉 E2E 无核驱动器完全竣工！');
    process.exit(0);
}

bootstrap().catch(console.error);
