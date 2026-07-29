import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PromptEngineService } from '../llm/prompt-engine.service';
import {
  AnalysisInputs,
  AnalysisReport,
  OcrItem,
  ShotSegment,
  TranscriptSegment,
  VisualDescriptionItem,
} from './analyzer.types';

/**
 * 视频分析器服务
 *
 * 并行执行 4 个维度的分析：
 * 1. 场景切分（PySceneDetect）—— 拆分镜头边界与关键帧
 * 2. 语音识别（FunASR）—— 提取口播文案及时间戳
 * 3. 画面 OCR（PaddleOCR）—— 提取画面中的商品名/价格/促销文案
 * 4. 画面描述（Qwen3-VL）—— 对关键帧做语义描述与卖点提炼
 *
 * 最终由 LLM 将多源结果汇总为结构化报告。
 *
 * 相关环境变量：
 * - VIDEO_ANALYZER_MODE: mock | auto（默认 mock，MVP 阶段）
 * - PYSCENEDETECT_API: 场景切分服务地址
 * - FUNASR_API: 语音识别服务地址
 * - PADDLE_OCR_API: OCR 服务地址
 * - QWEN_VL_API: Qwen3-VL 服务地址
 */
@Injectable()
export class VideoAnalyzerService {
  private readonly logger = new Logger(VideoAnalyzerService.name);
  private readonly forceMock: boolean;
  private readonly pySceneApi: string;
  private readonly funasrApi: string;
  private readonly paddleOcrApi: string;
  private readonly qwenVlApi: string;

  constructor(
    private readonly config: ConfigService,
    private readonly promptEngine: PromptEngineService,
  ) {
    const mode = this.config.get<string>('VIDEO_ANALYZER_MODE') ?? 'mock';
    this.forceMock = mode !== 'auto';
    this.pySceneApi =
      this.config.get<string>('PYSCENEDETECT_API') ?? 'http://localhost:8001';
    this.funasrApi =
      this.config.get<string>('FUNASR_API') ?? 'http://localhost:8002';
    this.paddleOcrApi =
      this.config.get<string>('PADDLE_OCR_API') ?? 'http://localhost:8003';
    this.qwenVlApi =
      this.config.get<string>('QWEN_VL_API') ?? 'http://localhost:8004';
  }

  /**
   * 分析视频，返回结构化报告
   * @param videoPath 视频本地路径或 URL
   */
  async analyze(videoPath: string): Promise<AnalysisReport> {
    this.logger.log(`开始分析视频 videoPath=${videoPath}`);

    if (this.forceMock) {
      return this.mockAnalyze(videoPath);
    }

    // 并行执行 4 维分析
    const [shots, transcript, ocr, visualDescription] = await Promise.all([
      this.runSceneDetection(videoPath).catch((err) => {
        this.logger.warn(`场景切分失败，降级 Mock: ${this.formatError(err)}`);
        return this.mockShots();
      }),
      this.runAsr(videoPath).catch((err) => {
        this.logger.warn(`语音识别失败，降级 Mock: ${this.formatError(err)}`);
        return this.mockTranscript();
      }),
      this.runOcr(videoPath).catch((err) => {
        this.logger.warn(`OCR 失败，降级 Mock: ${this.formatError(err)}`);
        return this.mockOcr();
      }),
      this.runVlm(videoPath).catch((err) => {
        this.logger.warn(`画面描述失败，降级 Mock: ${this.formatError(err)}`);
        return this.mockVisualDescription();
      }),
    ]);

    // LLM 汇总
    const inputs: AnalysisInputs = {
      shots,
      transcript,
      ocr,
      visualDescription,
    };
    const summary = await this.promptEngine.summarizeAnalysis(inputs);

    return {
      style: '快节奏带货种草',
      shots,
      transcript,
      ocr,
      visualDescription,
      summary,
      cloneableElements: this.extractCloneableElements(shots, transcript, visualDescription),
      source: 'real',
      analyzedAt: Date.now(),
    };
  }

  // -------------------- 4 维真实分析 --------------------

  /** 场景切分（PySceneDetect） */
  private async runSceneDetection(videoPath: string): Promise<ShotSegment[]> {
    const resp = await axios.post(`${this.pySceneApi}/scenes`, { videoPath });
    const data = resp.data?.scenes as Array<Record<string, unknown>> | undefined;
    if (!data) return [];
    return data.map((s, i) => ({
      index: i + 1,
      startTime: (s.start as number) ?? 0,
      endTime: (s.end as number) ?? 0,
      duration: ((s.end as number) ?? 0) - ((s.start as number) ?? 0),
      keyframeUrl: s.keyframe as string | undefined,
      shotType: s.type as string | undefined,
    }));
  }

  /** 语音识别（FunASR） */
  private async runAsr(videoPath: string): Promise<TranscriptSegment[]> {
    const resp = await axios.post(`${this.funasrApi}/asr`, { videoPath });
    const data = resp.data?.segments as Array<Record<string, unknown>> | undefined;
    if (!data) return [];
    return data.map((s, i) => ({
      index: i + 1,
      startTime: (s.start as number) ?? 0,
      endTime: (s.end as number) ?? 0,
      text: (s.text as string) ?? '',
    }));
  }

  /** 画面 OCR（PaddleOCR） */
  private async runOcr(videoPath: string): Promise<OcrItem[]> {
    const resp = await axios.post(`${this.paddleOcrApi}/ocr`, { videoPath });
    const data = resp.data?.items as Array<Record<string, unknown>> | undefined;
    if (!data) return [];
    return data.map((o, i) => ({
      index: i + 1,
      time: (o.time as number) ?? 0,
      text: (o.text as string) ?? '',
      confidence: o.confidence as number | undefined,
    }));
  }

  /** 画面描述（Qwen3-VL） */
  private async runVlm(videoPath: string): Promise<VisualDescriptionItem[]> {
    const resp = await axios.post(`${this.qwenVlApi}/describe`, { videoPath });
    const data = resp.data?.items as Array<Record<string, unknown>> | undefined;
    if (!data) return [];
    return data.map((v, i) => ({
      index: i + 1,
      time: (v.time as number) ?? 0,
      description: (v.description as string) ?? '',
      tags: v.tags as string[] | undefined,
    }));
  }

  /** 从分析结果提炼可复用元素 */
  private extractCloneableElements(
    shots: ShotSegment[],
    transcript: TranscriptSegment[],
    visualDescription: VisualDescriptionItem[],
  ) {
    return {
      shotStructure: shots.map(
        (s) => `${s.index}. ${s.shotType ?? '镜头'} ${s.duration.toFixed(1)}s`,
      ),
      copyScript: transcript.map((t) => t.text).join(' '),
      visualStyle: visualDescription.flatMap((v) => v.tags ?? []),
      pacing: `共 ${shots.length} 个镜头，平均时长 ${(shots.reduce((a, s) => a + s.duration, 0) / Math.max(shots.length, 1)).toFixed(1)}s`,
      bgmType: '节奏轻快',
    };
  }

  // -------------------- Mock 模式 --------------------

  /** Mock 分析：返回完整模拟报告 */
  private async mockAnalyze(videoPath: string): Promise<AnalysisReport> {
    this.logger.log(`[Mock] 分析视频 videoPath=${videoPath}`);
    const shots = this.mockShots();
    const transcript = this.mockTranscript();
    const ocr = this.mockOcr();
    const visualDescription = this.mockVisualDescription();

    // Mock 模式下也调用 LLM 汇总（LLM 自身可能也是 Mock，返回模板）
    const inputs: AnalysisInputs = {
      shots,
      transcript,
      ocr,
      visualDescription,
    };
    const summary = await this.promptEngine.summarizeAnalysis(inputs);

    return {
      style: '快节奏带货种草',
      shots,
      transcript,
      ocr,
      visualDescription,
      summary,
      cloneableElements: this.extractCloneableElements(shots, transcript, visualDescription),
      source: 'mock',
      analyzedAt: Date.now(),
    };
  }

  /** 模拟镜头切分 */
  private mockShots(): ShotSegment[] {
    return [
      { index: 1, startTime: 0, endTime: 2.5, duration: 2.5, shotType: '产品特写' },
      { index: 2, startTime: 2.5, endTime: 5, duration: 2.5, shotType: '口播讲解' },
      { index: 3, startTime: 5, endTime: 8, duration: 3, shotType: '使用场景' },
      { index: 4, startTime: 8, endTime: 10, duration: 2, shotType: '效果对比' },
      { index: 5, startTime: 10, endTime: 15, duration: 5, shotType: '行动号召' },
    ];
  }

  /** 模拟语音识别 */
  private mockTranscript(): TranscriptSegment[] {
    return [
      { index: 1, startTime: 0, endTime: 2.5, text: '姐妹们看这个神仙好物！' },
      { index: 2, startTime: 2.5, endTime: 5, text: '它采用了全新配方，质地超细腻。' },
      { index: 3, startTime: 5, endTime: 8, text: '上脸就是奶油肌，持妆一整天。' },
      { index: 4, startTime: 8, endTime: 10, text: '对比一下，效果立竿见影。' },
      { index: 5, startTime: 10, endTime: 15, text: '现在下单立减 50，手慢无！' },
    ];
  }

  /** 模拟 OCR */
  private mockOcr(): OcrItem[] {
    return [
      { index: 1, time: 0.5, text: '新品上市', confidence: 0.98 },
      { index: 2, time: 5, text: '持妆 24 小时', confidence: 0.95 },
      { index: 3, time: 10, text: '限时特惠 ¥99', confidence: 0.99 },
    ];
  }

  /** 模拟画面描述 */
  private mockVisualDescription(): VisualDescriptionItem[] {
    return [
      { index: 1, time: 1, description: '产品瓶身特写，暖色调灯光突出质感', tags: ['产品特写', '暖色调'] },
      { index: 2, time: 3.5, description: '博主手持产品对口播讲解', tags: ['口播', '真人出镜'] },
      { index: 3, time: 6, description: '模特上脸试用，展示奶油肌妆效', tags: ['试用', '妆效展示'] },
      { index: 4, time: 9, description: '左右对比图展示使用前后差异', tags: ['对比', '效果'] },
      { index: 5, time: 12, description: '购物车动画与价格信息弹出', tags: ['行动号召', '促销'] },
    ];
  }

  // -------------------- 工具方法 --------------------

  private formatError(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }
}
