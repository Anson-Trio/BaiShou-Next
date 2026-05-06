/**
 * TextSegmenter — 文本分词工具
 *
 * 支持两种分词模式：
 * 1. Jieba（中文分词，需要 nodejieba / nodejieba）
 * 2. SimpleWhitespaces（英文/无中文 fallback）
 *
 * 使用方式：
 * ```ts
 * const segmenter = TextSegmenter.getInstance();
 * const words = await segmenter.tokenize("今天天气真好");
 * // ["今天", "天气", "真好"]
 * ```
 *
 * 安装 Jieba：
 * ```
 * npm install nodejieba
 * # 或
 * yarn add nodejieba
 * ```
 */

export class TextSegmenter {
  private static _instance: TextSegmenter | null = null;
  private static _initPromise: Promise<TextSegmenter> | null = null;
  
  private jieba: any = null;
  private useJieba: boolean = false;
  private jiebaReady: boolean = false;

  private constructor() {
    // 构造函数不初始化 Jieba，延迟到 getInstance
  }

  public static getInstance(): TextSegmenter {
    if (!TextSegmenter._instance) {
      TextSegmenter._instance = new TextSegmenter();
      TextSegmenter._initPromise = TextSegmenter._instance.initJieba();
    }
    return TextSegmenter._instance;
  }

  /**
   * 获取初始化完成的 Promise（供异步等待）
   */
  public static getInitPromise(): Promise<TextSegmenter> {
    if (!TextSegmenter._initPromise) {
      TextSegmenter._initPromise = TextSegmenter.getInstance().initJieba();
    }
    return TextSegmenter._initPromise;
  }

  /**
   * 尝试初始化 Jieba
   */
  private async initJieba(): Promise<TextSegmenter> {
    try {
      // 尝试动态导入 nodejieba
      const nodejieba = await import('nodejieba');
      this.jieba = nodejieba.default || nodejieba;
      this.useJieba = true;
      this.jiebaReady = true;
      console.info('[TextSegmenter] Jieba 中文分词已就绪');
    } catch (e) {
      // Jieba 未安装，使用 fallback
      this.useJieba = false;
      this.jiebaReady = true;
      console.warn('[TextSegmenter] nodejieba 未安装，中文分词将使用简单字符分割');
    }
    return this;
  }

  /**
   * 判断文本是否包含中文
   */
  public isChinese(text: string): boolean {
    return /[\u4e00-\u9fa5]/.test(text);
  }

  /**
   * 分词主入口
   *
   * @param text 输入文本
   * @param options 分词选项
   * @returns 分词结果数组
   */
  public async tokenize(text: string, options: TokenizeOptions = {}): Promise<string[]> {
    const {
      enableChineseMerge = true,  // 是否将连续中文合并为短语
      enableEnglishTokenize = true, // 是否对英文进行 tokenize
      enableNumberFilter = true,   // 是否过滤纯数字
      maxWordLength = 20,          // 最大单词长度
    } = options;

    if (!text || !text.trim()) return [];

    const normalized = text.trim();

    // 如果启用了 Jieba 且文本包含中文
    if (this.useJieba && this.isChinese(normalized)) {
      try {
        // 使用 Jieba 精确模式分词
        let words = this.jieba.cut(normalized, false) as string[];

        // 过滤
        words = words.filter(w => w.trim().length > 0);

        if (enableNumberFilter) {
          words = words.filter(w => !/^\d+$/.test(w));
        }

        if (maxWordLength) {
          words = words.filter(w => w.length <= maxWordLength);
        }

        return words;
      } catch (e) {
        console.warn('[TextSegmenter] Jieba 分词失败，回退到字符分割:', e);
      }
    }

    // Fallback：按空白字符和标点分割
    const words = normalized
      .split(/[\s\p{P}]+/u)
      .filter(w => w.trim().length > 0 && w.length <= maxWordLength);

    if (enableNumberFilter) {
      return words.filter(w => !/^\d+$/.test(w));
    }

    return words;
  }

  /**
   * 从文本中提取关键词（基于词频）
   *
   * @param text 输入文本
   * @param topN 返回数量，默认 10
   * @returns 关键词列表（按重要性排序）
   */
  public async extractKeywords(text: string, topN: number = 10): Promise<string[]> {
    if (!text || !text.trim()) return [];

    if (this.useJieba) {
      try {
        // Jieba 提取关键词（TF-IDF）
        const keywords = this.jieba.extract(text, topN) as Array<[string, number]>;
        return keywords.map(([word]) => word);
      } catch (e) {
        console.warn('[TextSegmenter] Jieba 关键词提取失败:', e);
      }
    }

    // Fallback：取文本前 topN 个词
    const words = await this.tokenize(text);
    return [...new Set(words)].slice(0, topN);
  }

  /**
   * 为搜索查询生成同义词扩展（简易版）
   *
   * @param query 用户查询
   * @returns 扩展后的搜索词列表
   */
  public async expandQuery(query: string): Promise<string[]> {
    const words = await this.tokenize(query);
    const expanded = new Set<string>(words);

    // 添加原始查询词
    expanded.add(query.trim());

    // 对每个词添加部分匹配（取前 2-3 个字符）
    for (const word of words) {
      if (word.length >= 3) {
        // 添加前缀（用于前缀匹配）
        expanded.add(word.slice(0, 2));
        if (word.length >= 4) {
          expanded.add(word.slice(0, 3));
        }
      }
    }

    return Array.from(expanded);
  }

  /**
   * 判断 Jieba 是否已就绪（初始化完成）
   */
  public isJiebaAvailable(): boolean {
    return this.jiebaReady && this.useJieba;
  }

  /**
   * 判断是否已完成初始化
   */
  public isReady(): boolean {
    return this.jiebaReady;
  }
}

export interface TokenizeOptions {
  enableChineseMerge?: boolean;
  enableEnglishTokenize?: boolean;
  enableNumberFilter?: boolean;
  maxWordLength?: number;
}

// 导出单例快捷访问
export const textSegmenter = TextSegmenter.getInstance();
