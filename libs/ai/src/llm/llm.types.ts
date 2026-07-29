/**
 * LLM 大语言模型类型定义
 */

/** LLM 服务商枚举 */
export enum LlmProvider {
  /** 通义千问（DashScope） */
  TONGYI = 'tongyi',
  /** 豆包（火山 Ark） */
  DOUBAO = 'doubao',
  /** DeepSeek */
  DEEPSEEK = 'deepseek',
  /** OpenAI 兼容 */
  OPENAI = 'openai',
}

/** 消息角色 */
export type LlmRole = 'system' | 'user' | 'assistant';

/** 单条消息 */
export interface LlmMessage {
  role: LlmRole;
  content: string;
}

/** 补全请求参数 */
export interface LlmCompleteOptions {
  /** 温度，0-2，越高越发散 */
  temperature?: number;
  /** 最大输出 token 数 */
  maxTokens?: number;
  /** 模型名（覆盖默认配置） */
  model?: string;
}

/** 文案生成参数 */
export interface CopyGenerationParams {
  /** 文案类型：标题/口播/卖点/包装 */
  type: 'title' | 'script' | 'sellingPoint' | 'description';
  /** 主题/产品描述 */
  topic: string;
  /** 行业，如「美妆」「数码」「食品」 */
  industry?: string;
  /** 目标受众 */
  audience?: string;
  /** 字数限制 */
  wordLimit?: number;
  /** 参考素材描述 */
  reference?: string;
}
