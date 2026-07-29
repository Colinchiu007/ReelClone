import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CompressionQuality,
  TranscodeOptions,
  VideoMetaInfo,
} from './ffmpeg.types';

/**
 * FFmpeg 命令行封装服务
 *
 * 提供视频转码、封面截取、压缩、元信息读取能力。
 * 实际调用 ffmpeg / ffprobe 命令行，MVP 阶段（ffmpeg 不可用或 FFMPEG_MODE=mock）返回模拟数据。
 *
 * 相关环境变量：
 * - FFMPEG_MODE: mock | auto（默认 auto）
 * - FFMPEG_PATH: ffmpeg 可执行文件路径（默认 ffmpeg）
 */
@Injectable()
export class FfmpegService {
  private readonly logger = new Logger(FfmpegService.name);
  private readonly forceMock: boolean;
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;
  /** ffmpeg 可用性缓存 */
  private availability: boolean | null = null;

  constructor(private readonly config: ConfigService) {
    const mode = this.config.get<string>('FFMPEG_MODE') ?? 'auto';
    this.forceMock = mode === 'mock';
    this.ffmpegPath = this.config.get<string>('FFMPEG_PATH') ?? 'ffmpeg';
    this.ffprobePath = this.config.get<string>('FFPROBE_PATH') ?? 'ffprobe';
  }

  /**
   * 转码视频
   * @param inputPath 输入路径
   * @param outputPath 输出路径
   * @param options 转码选项
   */
  async transcode(
    inputPath: string,
    outputPath: string,
    options?: TranscodeOptions,
  ): Promise<string> {
    if (await this.shouldUseMock()) {
      return this.mockTranscode(inputPath, outputPath, options);
    }

    const args = ['-y', '-i', inputPath];
    if (options?.videoCodec) args.push('-c:v', options.videoCodec);
    if (options?.audioCodec) args.push('-c:a', options.audioCodec);
    if (options?.videoBitrate) args.push('-b:v', options.videoBitrate);
    if (options?.resolution) {
      args.push('-s', options.resolution);
    }
    if (options?.fps) args.push('-r', String(options.fps));
    if (options?.extraArgs?.length) args.push(...options.extraArgs);
    args.push(outputPath);

    const result = await this.runCommand(this.ffmpegPath, args);
    if (result.exitCode !== 0) {
      throw new Error(`ffmpeg 转码失败: ${result.stderr}`);
    }
    this.logger.log(`转码完成 ${inputPath} → ${outputPath}`);
    return outputPath;
  }

  /**
   * 截取视频封面
   * @param videoPath 视频路径
   * @param time 截取时间点（秒）
   * @param outputPath 输出图片路径
   */
  async generateThumbnail(
    videoPath: string,
    time: number,
    outputPath: string,
  ): Promise<string> {
    if (await this.shouldUseMock()) {
      this.logger.log(
        `[Mock] 生成封面 ${videoPath}@${time}s → ${outputPath}`,
      );
      return outputPath;
    }

    const args = [
      '-y',
      '-ss',
      String(time),
      '-i',
      videoPath,
      '-vframes',
      '1',
      '-q:v',
      '2',
      outputPath,
    ];
    const result = await this.runCommand(this.ffmpegPath, args);
    if (result.exitCode !== 0) {
      throw new Error(`ffmpeg 截取封面失败: ${result.stderr}`);
    }
    this.logger.log(`封面生成完成 → ${outputPath}`);
    return outputPath;
  }

  /**
   * 压缩视频
   * @param inputPath 输入路径
   * @param outputPath 输出路径
   * @param quality 压缩质量
   */
  async compress(
    inputPath: string,
    outputPath: string,
    quality: CompressionQuality = 'medium',
  ): Promise<string> {
    if (await this.shouldUseMock()) {
      this.logger.log(`[Mock] 压缩视频 quality=${quality} → ${outputPath}`);
      return outputPath;
    }

    // CRF 值：low=28（高压缩）/ medium=23（平衡）/ high=18（高质量）
    const crfMap: Record<CompressionQuality, number> = {
      low: 28,
      medium: 23,
      high: 18,
    };
    const args = [
      '-y',
      '-i',
      inputPath,
      '-c:v',
      'libx264',
      '-crf',
      String(crfMap[quality]),
      '-preset',
      'medium',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      outputPath,
    ];
    const result = await this.runCommand(this.ffmpegPath, args);
    if (result.exitCode !== 0) {
      throw new Error(`ffmpeg 压缩失败: ${result.stderr}`);
    }
    this.logger.log(`压缩完成 quality=${quality} → ${outputPath}`);
    return outputPath;
  }

  /**
   * 读取视频元信息
   * @param videoPath 视频路径
   */
  async getMetadata(videoPath: string): Promise<VideoMetaInfo> {
    if (await this.shouldUseMock()) {
      return this.mockMetadata();
    }

    const args = [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      videoPath,
    ];
    const result = await this.runCommand(this.ffprobePath, args);
    if (result.exitCode !== 0) {
      this.logger.warn(`ffprobe 读取失败，返回 Mock 元信息: ${result.stderr}`);
      return this.mockMetadata();
    }

    return this.parseFfprobeOutput(result.stdout);
  }

  // -------------------- 解析 --------------------

  /** 解析 ffprobe JSON 输出 */
  private parseFfprobeOutput(stdout: string): VideoMetaInfo {
    try {
      const data = JSON.parse(stdout) as {
        format?: Record<string, unknown>;
        streams?: Array<Record<string, unknown>>;
      };
      const format = data.format ?? {};
      const streams = data.streams ?? [];
      const video = streams.find((s) => s.codec_type === 'video');
      const audio = streams.find((s) => s.codec_type === 'audio');

      return {
        duration: parseFloat((format.duration as string) ?? '0'),
        width: (video?.width as number) ?? 0,
        height: (video?.height as number) ?? 0,
        videoBitrate: this.parseBitrate(
          (video?.bit_rate as string) ?? (format.bit_rate as string),
        ),
        audioBitrate: this.parseBitrate(audio?.bit_rate as string),
        videoCodec: video?.codec_name as string | undefined,
        audioCodec: audio?.codec_name as string | undefined,
        fps: this.parseFps(video?.r_frame_rate as string | undefined),
        size: format.size ? parseInt(format.size as string, 10) : undefined,
      };
    } catch {
      this.logger.warn('解析 ffprobe 输出失败，返回 Mock 元信息');
      return this.mockMetadata();
    }
  }

  private parseBitrate(raw: string | undefined): number | undefined {
    if (!raw) return undefined;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? undefined : n;
  }

  private parseFps(raw: string | undefined): number | undefined {
    if (!raw) return undefined;
    const [num, den] = raw.split('/').map((n) => parseInt(n, 10));
    if (!den || Number.isNaN(num) || Number.isNaN(den)) return undefined;
    return Math.round((num / den) * 100) / 100;
  }

  // -------------------- Mock --------------------

  /** 是否使用 Mock */
  private async shouldUseMock(): Promise<boolean> {
    if (this.forceMock) return true;
    if (this.availability === null) {
      this.availability = await this.checkFfmpeg();
    }
    return !this.availability;
  }

  /** 检查 ffmpeg 是否可用 */
  private async checkFfmpeg(): Promise<boolean> {
    try {
      const result = await this.runCommand(this.ffmpegPath, ['-version'], {
        timeout: 5_000,
      });
      const ok = result.exitCode === 0;
      this.logger.log(`ffmpeg 可用性: ${ok}`);
      return ok;
    } catch {
      this.logger.warn('ffmpeg 不可用，将使用 Mock 模式');
      return false;
    }
  }

  /** 模拟转码 */
  private async mockTranscode(
    inputPath: string,
    outputPath: string,
    options?: TranscodeOptions,
  ): Promise<string> {
    this.logger.log(
      `[Mock] 转码 ${inputPath} → ${outputPath} codec=${options?.videoCodec ?? '默认'}`,
    );
    return outputPath;
  }

  /** 模拟元信息 */
  private mockMetadata(): VideoMetaInfo {
    return {
      duration: 15,
      width: 1080,
      height: 1920,
      videoBitrate: 2_500_000,
      audioBitrate: 128_000,
      videoCodec: 'h264',
      audioCodec: 'aac',
      fps: 30,
      size: 4_800_000,
    };
  }

  // -------------------- 命令执行 --------------------

  /**
   * 执行命令行（execa 动态导入，兼容 ESM/CJS）
   */
  private async runCommand(
    cmd: string,
    args: string[],
    options?: { timeout?: number },
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    try {
      const execaModule = await import('execa');
      const execa = execaModule.execa;
      const result = await execa(cmd, args, {
        reject: false,
        timeout: options?.timeout,
      });
      return {
        exitCode: result.exitCode ?? 0,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
      };
    } catch (err) {
      throw new Error(`执行命令失败 ${cmd}: ${this.formatError(err)}`);
    }
  }

  private formatError(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }
}
