import { Injectable, Logger } from '@nestjs/common';
import { LlmProvider } from './llm.provider';
import { CopyGenerationParams } from './llm.types';
import { AnalysisInputs } from '../analyzer/analyzer.types';

/**
 * 提示词引擎服务
 *
 * 提供视频/图像创作场景下的智能提示词与文案生成能力：
 * - reversePrompt: 图像反推提示词
 * - polishPrompt: 提示词润色与扩写
 * - generateCopy: 营销文案生成（标题/口播/卖点/包装）
 * - summarizeAnalysis: 将对标视频的多源分析结果汇总为结构化报告
 *
 * 所有方法在 LLM Mock 模式下也会返回合理的模板结果。
 */
@Injectable()
export class PromptEngineService {
  private readonly logger = new Logger(PromptEngineService.name);

  constructor(private readonly llm: LlmProvider) {}

  /**
   * 反推图像提示词
   * @param imageUrl 图片 URL 或本地路径
   * @returns 画面描述与提示词
   */
  async reversePrompt(imageUrl: string): Promise<string> {
    this.logger.log(`反推提示词 imageUrl=${imageUrl}`);

    const prompt = this.buildReversePrompt(imageUrl);
    const system =
      '你是一位专业的视频/图像描述专家，擅长将画面转化为精准的文生视频提示词。';
    const text = await this.llm.complete(
      [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.4, maxTokens: 512 },
    );
    return text.trim();
  }

  /**
   * 润色提示词
   * @param rawPrompt 原始提示词
   * @param industry 行业，用于贴合行业风格
   * @returns 润色后的提示词
   */
  async polishPrompt(rawPrompt: string, industry?: string): Promise<string> {
    this.logger.log(
      `润色提示词 rawPrompt=${rawPrompt.slice(0, 30)} industry=${industry ?? '通用'}`,
    );

    const prompt = this.buildPolishPrompt(rawPrompt, industry);
    const system =
      '你是一位视频创作提示词工程师，擅长在保留用户意图的基础上补充镜头、光影、风格、节奏等细节。';
    const text = await this.llm.complete(
      [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.7, maxTokens: 512 },
    );
    return text.trim();
  }

  /**
   * 生成营销文案
   * @param params 文案生成参数
   * @returns 文案文本
   */
  async generateCopy(params: CopyGenerationParams): Promise<string> {
    this.logger.log(`生成文案 type=${params.type} topic=${params.topic}`);

    const prompt = this.buildCopyPrompt(params);
    const system =
      '你是一位资深短视频营销文案专家，擅长撰写高转化的标题、口播脚本与卖点文案。';
    const text = await this.llm.complete(
      [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.8, maxTokens: params.wordLimit ? Math.ceil(params.wordLimit * 2) : 768 },
    );
    return text.trim();
  }

  /**
   * 汇总对标解析报告
   * @param inputs 多源分析结果（镜头/ASR/OCR/VLM）
   * @returns 结构化汇总文本（Markdown）
   */
  async summarizeAnalysis(inputs: AnalysisInputs): Promise<string> {
    this.logger.log(
      `汇总对标解析 shots=${inputs.shots.length} transcript=${inputs.transcript.length} ocr=${inputs.ocr.length} vlm=${inputs.visualDescription.length}`,
    );

    const prompt = this.buildSummaryPrompt(inputs);
    const system =
      '你是一位短视频内容策略分析师，擅长从镜头、口播、画面文字、视觉描述中提炼可复用的创作模板。';
    const text = await this.llm.complete(
      [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.5, maxTokens: 1024 },
    );
    return text.trim();
  }

  // -------------------- 提示词模板 --------------------

  private buildReversePrompt(imageUrl: string): string {
    return [
      '请根据以下图片，生成一段用于文生视频的中文提示词。',
      `图片地址：${imageUrl}`,
      '要求：',
      '1. 描述画面主体、场景、光影、色调、镜头运动；',
      '2. 输出 80-150 字的中文提示词；',
      '3. 不解释、不寒暄，直接输出提示词。',
    ].join('\n');
  }

  private buildPolishPrompt(rawPrompt: string, industry?: string): string {
    return [
      `原始提示词：${rawPrompt}`,
      `行业偏好：${industry ?? '通用'}`,
      '请在保留原意基础上：',
      '1. 补充镜头景别（特写/中景/全景）与运动方式；',
      '2. 补充光影与色调描述；',
      '3. 结合行业风格强化画面表现力；',
      '4. 输出 100-200 字润色后的提示词。',
    ].join('\n');
  }

  private buildCopyPrompt(params: CopyGenerationParams): string {
    const typeMap: Record<CopyGenerationParams['type'], string> = {
      title: '短视频标题（15 字以内，吸睛有冲击力）',
      script: '口播脚本（口语化，适合真人或数字人朗读）',
      sellingPoint: '核心卖点（3 条，每条一句话）',
      description: '作品包装描述（用于发布页展示）',
    };
    return [
      `文案类型：${typeMap[params.type]}`,
      `主题/产品：${params.topic}`,
      `行业：${params.industry ?? '通用'}`,
      `目标受众：${params.audience ?? '泛人群'}`,
      params.wordLimit ? `字数限制：${params.wordLimit} 字以内` : '',
      params.reference ? `参考素材：${params.reference}` : '',
      '请直接输出文案，不要寒暄与解释。',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildSummaryPrompt(inputs: AnalysisInputs): string {
    const shotsText = inputs.shots
      .map(
        (s) =>
          `  ${s.index}. [${s.startTime.toFixed(1)}-${s.endTime.toFixed(1)}s] ${s.shotType ?? '未知镜头'}（${s.duration.toFixed(1)}s）`,
      )
      .join('\n');
    const transcriptText = inputs.transcript
      .map((t) => `  [${t.startTime.toFixed(1)}s] ${t.text}`)
      .join('\n');
    const ocrText = inputs.ocr.map((o) => `  ${o.text}`).join('\n');
    const vlmText = inputs.visualDescription
      .map((v) => `  ${v.description}`)
      .join('\n');

    return [
      '以下是对标视频的多维度分析结果，请汇总为结构化报告：',
      '',
      '【镜头切分】',
      shotsText || '  无',
      '',
      '【口播文案（ASR）】',
      transcriptText || '  无',
      '',
      '【画面文字（OCR）】',
      ocrText || '  无',
      '',
      '【画面描述（VLM）】',
      vlmText || '  无',
      '',
      '请输出 Markdown 格式报告，包含：',
      '1. 视频整体风格判断',
      '2. 节奏与时长结构建议',
      '3. 可复用的镜头结构清单',
      '4. 口播文案改写建议',
      '5. 一键复刻要点',
    ].join('\n');
  }
}
