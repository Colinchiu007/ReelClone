import { Injectable, Logger } from '@nestjs/common';

/**
 * 审核结果
 */
export interface ModerationResult {
  /** 是否通过审核 */
  passed: boolean;
  /** 不通过原因（passed=false 时有值） */
  reason?: string;
  /** 命中的敏感词列表 */
  hitKeywords?: string[];
}

/**
 * 内容安全审核服务
 *
 * MVP 阶段使用关键词黑名单过滤，后续可接入腾讯云/阿里云内容安全服务。
 * 覆盖政治、色情、暴力、违法广告、违禁品等敏感词。
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  /** 敏感词黑名单（示例，生产环境应从配置或数据库加载） */
  private readonly keywords: string[] = [
    // 政治敏感
    '反动',
    '颠覆',
    // 色情低俗
    '色情',
    '裸体',
    '成人电影',
    // 暴力恐怖
    '暴力',
    '恐怖袭击',
    '杀人',
    // 违法犯罪
    '毒品',
    '吸毒',
    '赌博',
    '诈骗',
    '洗钱',
    // 违禁品
    '枪支',
    '弹药',
    '管制刀具',
    // 虚假宣传
    '最有效',
    '包治百病',
    '绝对正品',
    '国家级',
  ];

  /**
   * 审核视频
   * MVP 阶段：仅检测文件名中的敏感词；完整实现应抽帧 + ASR + OCR 综合判断。
   * @param videoPath 视频路径
   */
  async moderateVideo(videoPath: string): Promise<ModerationResult> {
    this.logger.log(`审核视频 videoPath=${videoPath}`);
    return this.moderateText(videoPath);
  }

  /**
   * 审核图片
   * MVP 阶段：仅检测文件名；完整实现应接入图片内容安全 API。
   * @param imagePath 图片路径
   */
  async moderateImage(imagePath: string): Promise<ModerationResult> {
    this.logger.log(`审核图片 imagePath=${imagePath}`);
    return this.moderateText(imagePath);
  }

  /**
   * 审核文本
   * @param text 待审核文本
   */
  async moderateText(text: string): Promise<ModerationResult> {
    if (!text) {
      return { passed: true };
    }
    const lower = text.toLowerCase();
    const hits = this.keywords.filter((kw) => lower.includes(kw.toLowerCase()));
    if (hits.length > 0) {
      this.logger.warn(`文本审核未通过，命中敏感词: ${hits.join(', ')}`);
      return {
        passed: false,
        reason: `内容包含敏感词: ${hits.join(', ')}`,
        hitKeywords: hits,
      };
    }
    return { passed: true };
  }
}
