import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SeedanceProvider } from './seedance/seedance.provider';
import { LlmProvider } from './llm/llm.provider';
import { PromptEngineService } from './llm/prompt-engine.service';
import { VideoDownloaderService } from './downloader/video-downloader.service';
import { VideoAnalyzerService } from './analyzer/video-analyzer.service';
import { FfmpegService } from './ffmpeg/ffmpeg.service';
import { ModerationService } from './moderation/moderation.service';

/**
 * AI 能力模块
 *
 * 统一聚合所有 AI Provider 与 Service，供业务服务注入使用。
 * 所有适配器均支持 Mock 模式（无需真实 API Key 即可联调）。
 *
 * 使用方式：
 *   @Module({
 *     imports: [AiModule],
 *   })
 *   export class AppModule {}
 *
 * 然后在任意 service 中注入：
 *   constructor(private readonly seedance: SeedanceProvider) {}
 */
@Module({
  imports: [ConfigModule],
  providers: [
    SeedanceProvider,
    LlmProvider,
    PromptEngineService,
    VideoDownloaderService,
    VideoAnalyzerService,
    FfmpegService,
    ModerationService,
  ],
  exports: [
    SeedanceProvider,
    LlmProvider,
    PromptEngineService,
    VideoDownloaderService,
    VideoAnalyzerService,
    FfmpegService,
    ModerationService,
  ],
})
export class AiModule {}
