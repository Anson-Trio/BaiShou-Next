export enum ProviderType {
  OpenAI = 'openai',
  Anthropic = 'anthropic',
  Gemini = 'gemini',
  DeepSeek = 'deepseek',
  Kimi = 'kimi',
  Ollama = 'ollama',
  SiliconFlow = 'siliconflow',
  OpenRouter = 'openrouter',
  DashScope = 'dashscope',
  Doubao = 'doubao',
  Grok = 'grok',
  Mistral = 'mistral',
  LMStudio = 'lmstudio',
  Zhipu = 'zhipu',
  StepFun = 'stepfun',
  Hunyuan = 'hunyuan',
  MiniMax = 'minimax',
  VertexAI = 'vertexai',
  Vercel = 'vercel',
  XiaomiMiMo = 'xiaomimimo',
  Custom = 'custom'
}

export enum WebSearchMode {
  Off = 'off',
  Tool = 'tool'
}

/**
 * AI 模型高级配置参数
 * 所有参数均为可选，未配置时使用提供商 SDK 默认值
 */
export interface AiProviderAdvancedConfig {
  /** 温度系数 (0-2)，控制输出随机性 */
  temperature?: number
  /** Top-K 采样 (1-100)，限制候选词汇数量 */
  topK?: number
  /** Top-P 采样 (0-1)，核采样阈值 */
  topP?: number
  /** 最大生成 token 数 (1-32000) */
  maxTokens?: number
  /** 频率惩罚 (-2.0 - 2.0)，降低重复词频 */
  frequencyPenalty?: number
  /** 存在惩罚 (-2.0 - 2.0)，降低重复主题 */
  presencePenalty?: number
}

export interface AiProviderModel {
  id: string
  name: string
  type: ProviderType
  apiKey: string
  baseUrl: string
  models: string[]
  defaultDialogueModel: string
  defaultNamingModel: string
  isEnabled: boolean
  enabledModels: string[]
  notes?: string
  isSystem: boolean
  sortOrder: number
  webSearchMode: WebSearchMode
  /** 高级模型配置参数（可选） */
  advancedConfig?: AiProviderAdvancedConfig
}

/**
 * 根据 ProviderType 返回默认的搜索模式
 */
export function getDefaultWebSearchMode(_type: ProviderType): WebSearchMode {
  return WebSearchMode.Tool
}

/**
 * 创建一个符合要求且带默认字段的 AI 提供商配置
 */
export function createAiProvider(
  model: Partial<AiProviderModel> & Pick<AiProviderModel, 'id' | 'name' | 'type'>
): AiProviderModel {
  return {
    apiKey: '',
    baseUrl: '',
    models: [],
    defaultDialogueModel: '',
    defaultNamingModel: '',
    isEnabled: true,
    enabledModels: [],
    isSystem: true,
    sortOrder: 0,
    webSearchMode: model.webSearchMode ?? getDefaultWebSearchMode(model.type),
    ...model
  }
}
