import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ExternalResourcePolicyService } from '@reelclone/common'
import { DownloadResult, VideoMetadata, VideoPlatform } from './downloader.types'

/** yt-dlp --print-json 输出的元信息字段（仅声明实际取用的部分） */
interface YtDlpJsonInfo {
  _filename?: string
  title?: string
  uploader?: string
  duration?: number
  thumbnail?: string
}

/**
 * 视频下载器服务
 *
 * 支持 5 大平台：抖音、小红书、哔哩哔哩、快手、微博。
 * 下载策略：优先使用 lux，失败降级到 yt-dlp。
 * Mock 模式：未检测到下载工具或环境变量 VIDEO_DOWNLOADER=mock 时返回示例视频路径。
 *
 * 安全：下载前通过 ExternalResourcePolicyService 校验 URL（SSRF 防护），
 * 未知平台或私网地址将被拒绝。DNS 解析后可调用 policy.isPrivateAddress() 复核。
 *
 * 相关环境变量：
 * - VIDEO_DOWNLOADER: mock | auto（默认 auto）
 * - DOWNLOAD_OUTPUT_DIR: 下载目录，默认 ./downloads
 * - VIDEO_DOWNLOADER_COOKIES: cookies.txt 文件路径（抖音等平台需要浏览器 cookies）
 */
@Injectable()
export class VideoDownloaderService {
  private readonly logger = new Logger(VideoDownloaderService.name)
  private readonly outputDir: string
  private readonly forceMock: boolean
  /** cookies.txt 文件路径（yt-dlp 用于抖音等需要登录的平台） */
  private readonly cookiesFile: string | null
  /** lux / yt-dlp 可用性缓存（避免每次都探测） */
  private toolAvailability: { lux: boolean; ytdlp: boolean } | null = null

  constructor(
    private readonly config: ConfigService,
    private readonly policy: ExternalResourcePolicyService,
  ) {
    this.outputDir = this.config.get<string>('DOWNLOAD_OUTPUT_DIR') ?? './downloads'
    const mode = this.config.get<string>('VIDEO_DOWNLOADER') ?? 'auto'
    this.forceMock = mode === 'mock'
    this.cookiesFile = this.config.get<string>('VIDEO_DOWNLOADER_COOKIES') ?? null
    if (this.cookiesFile) {
      this.logger.log(`视频下载器使用 cookies 文件: ${this.cookiesFile}`)
    }
  }

  /**
   * 下载视频
   *
   * 下载前通过 ExternalResourcePolicy 校验 URL：
   *  - scheme 必须为 http/https
   *  - hostname 必须在 allowlist 中（子域名匹配）
   *  - 字面量 IP 必须不是私网/回环/保留地址
   *
   * @param url 视频链接
   * @returns 下载结果（路径、平台、元信息）
   * @throws ExternalResourceError 当 URL 不合法或存在安全风险时
   */
  async download(url: string): Promise<DownloadResult> {
    // SSRF 防护：下载前校验 URL
    this.policy.validateUrl(url)

    const platform = this.detectPlatform(url)
    this.logger.log(`开始下载 url=${url} platform=${platform}`)

    if (this.forceMock) {
      return this.mockDownload(url, platform)
    }

    // 探测可用工具
    const availability = await this.detectTools()

    // 优先 lux
    if (availability.lux) {
      try {
        return await this.downloadWithLux(url, platform)
      } catch (err) {
        this.logger.warn(`lux 下载失败，降级 yt-dlp: ${this.formatError(err)}`)
      }
    }

    // 兜底 yt-dlp
    if (availability.ytdlp) {
      try {
        return await this.downloadWithYtDlp(url, platform)
      } catch (err) {
        this.logger.warn(`yt-dlp 下载失败: ${this.formatError(err)}`)
      }
    }

    // 无可用工具，回退 Mock
    this.logger.warn('未检测到 lux/yt-dlp，回退 Mock 模式')
    return this.mockDownload(url, platform)
  }

  /**
   * 识别视频平台
   *
   * 注意：此方法仅用于平台标签（影响下载结果元信息），不做安全校验。
   * 安全校验由 ExternalResourcePolicy.validateUrl() 在 download() 入口完成。
   * 使用 URL hostname 精确匹配，不再使用字符串 includes（避免误匹配）。
   */
  detectPlatform(url: string): VideoPlatform {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return VideoPlatform.UNKNOWN
    }
    const host = parsed.hostname.toLowerCase()

    if (
      host === 'douyin.com' ||
      host === 'www.douyin.com' ||
      host === 'v.douyin.com' ||
      host === 'iesdouyin.com' ||
      host.endsWith('.douyin.com') ||
      host.endsWith('.iesdouyin.com')
    ) {
      return VideoPlatform.DOUYIN
    }
    if (
      host === 'xiaohongshu.com' ||
      host === 'www.xiaohongshu.com' ||
      host === 'xhslink.com' ||
      host.endsWith('.xiaohongshu.com')
    ) {
      return VideoPlatform.XIAOHONGSHU
    }
    if (
      host === 'bilibili.com' ||
      host === 'www.bilibili.com' ||
      host === 'm.bilibili.com' ||
      host === 'b23.tv' ||
      host.endsWith('.bilibili.com')
    ) {
      return VideoPlatform.BILIBILI
    }
    if (host === 'kuaishou.com' || host === 'www.kuaishou.com' || host.endsWith('.kuaishou.com')) {
      return VideoPlatform.KUAISHOU
    }
    if (host === 'weibo.com' || host === 'weibo.cn' || host.endsWith('.weibo.com')) {
      return VideoPlatform.WEIBO
    }
    return VideoPlatform.UNKNOWN
  }

  // -------------------- 真实下载 --------------------

  /** 使用 lux 下载 */
  private async downloadWithLux(url: string, platform: VideoPlatform): Promise<DownloadResult> {
    const args = ['-o', this.outputDir]
    // 抖音等平台需要 cookies 才能下载（与 yt-dlp 对齐）
    if (this.cookiesFile) {
      args.push('-c', this.cookiesFile)
    }
    args.push(url)
    const result = await this.runCommand('lux', args)
    if (result.exitCode !== 0) {
      throw new Error(`lux 退出码 ${result.exitCode}: ${result.stderr}`)
    }
    // lux 输出中解析文件路径（实际实现需解析 stdout）
    const videoPath = this.parseLuxOutput(result.stdout, platform)
    return {
      videoPath,
      platform,
      metadata: this.parseLuxMetadata(result.stdout),
      downloader: 'lux',
    }
  }

  /** 使用 yt-dlp 下载 */
  private async downloadWithYtDlp(url: string, platform: VideoPlatform): Promise<DownloadResult> {
    const outputPath = `${this.outputDir}/%(id)s.%(ext)s`
    const args = ['-o', outputPath, '--print-json']
    // 抖音等平台需要 cookies 才能下载
    if (this.cookiesFile) {
      args.push('--cookies', this.cookiesFile)
    }
    args.push(url)
    const result = await this.runCommand('yt-dlp', args)
    if (result.exitCode !== 0) {
      throw new Error(`yt-dlp 退出码 ${result.exitCode}: ${result.stderr}`)
    }
    const metadata = this.parseYtDlpJson(result.stdout)
    return {
      videoPath: metadata._filename ?? `${this.outputDir}/${platform}.mp4`,
      platform,
      metadata: {
        title: metadata.title,
        author: metadata.uploader,
        duration: metadata.duration,
        coverUrl: metadata.thumbnail,
      },
      downloader: 'yt-dlp',
    }
  }

  /** 探测 lux / yt-dlp 是否可用 */
  private async detectTools(): Promise<{ lux: boolean; ytdlp: boolean }> {
    if (this.toolAvailability) {
      return this.toolAvailability
    }
    const [luxOk, ytdlpOk] = await Promise.all([
      this.checkCommand('lux', ['--version']),
      this.checkCommand('yt-dlp', ['--version']),
    ])
    this.toolAvailability = { lux: luxOk, ytdlp: ytdlpOk }
    this.logger.log(`下载工具可用性 lux=${luxOk} yt-dlp=${ytdlpOk}`)
    return this.toolAvailability
  }

  /** 检查命令是否可执行 */
  private async checkCommand(cmd: string, args: string[]): Promise<boolean> {
    try {
      const result = await this.runCommand(cmd, args, { timeout: 5_000 })
      return result.exitCode === 0
    } catch {
      return false
    }
  }

  // -------------------- Mock 模式 --------------------

  /** Mock 下载：返回示例视频路径 */
  private async mockDownload(url: string, platform: VideoPlatform): Promise<DownloadResult> {
    const timestamp = Date.now()
    const videoPath = `${this.outputDir}/mock-${platform.toLowerCase()}-${timestamp}.mp4`
    this.logger.log(`[Mock] 下载完成 url=${url} → ${videoPath}`)
    return {
      videoPath,
      platform,
      metadata: this.buildMockMetadata(platform),
      downloader: 'mock',
    }
  }

  /** 构造模拟元信息 */
  private buildMockMetadata(platform: VideoPlatform): VideoMetadata {
    const platformLabel: Record<VideoPlatform, string> = {
      [VideoPlatform.DOUYIN]: '抖音',
      [VideoPlatform.XIAOHONGSHU]: '小红书',
      [VideoPlatform.BILIBILI]: '哔哩哔哩',
      [VideoPlatform.KUAISHOU]: '快手',
      [VideoPlatform.WEIBO]: '微博',
      [VideoPlatform.UNKNOWN]: '未知平台',
    }
    return {
      title: `${platformLabel[platform]}爆款种草视频示例`,
      author: 'mock_creator',
      sourceId: `mock_${Date.now()}`,
      description: '这是一条用于联调的模拟视频，实际下载需安装 lux 或 yt-dlp。',
      duration: 15,
      coverUrl: 'https://mock.reelclone.local/covers/mock-cover.jpg',
    }
  }

  // -------------------- 解析与工具方法 --------------------

  /** 解析 lux stdout 提取文件路径 */
  private parseLuxOutput(stdout: string, platform: VideoPlatform): string {
    // lux 默认输出文件路径在末尾行
    const lines = stdout.split('\n').filter((l) => l.trim())
    for (const line of lines) {
      if (line.includes('.mp4') || line.includes('.flv')) {
        return line.trim().split(/\s+/).pop() ?? `${this.outputDir}/${platform}.mp4`
      }
    }
    return `${this.outputDir}/${platform}.mp4`
  }

  /** 解析 lux 输出为元信息 */
  private parseLuxMetadata(stdout: string): VideoMetadata {
    return { title: stdout.split('\n')[0]?.trim() || undefined }
  }

  /** 解析 yt-dlp --print-json 输出 */
  private parseYtDlpJson(stdout: string): YtDlpJsonInfo {
    try {
      const lines = stdout.trim().split('\n')
      const lastLine = lines[lines.length - 1]
      return JSON.parse(lastLine) as YtDlpJsonInfo
    } catch {
      return {}
    }
  }

  /**
   * 执行命令行工具（使用 execa 动态导入，兼容 ESM/CJS）
   */
  private async runCommand(
    cmd: string,
    args: string[],
    options?: { timeout?: number },
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    try {
      // 动态导入 execa 以兼容 ESM-only 的 execa v9+
      const execaModule = await import('execa')
      const execa = execaModule.execa
      const result = await execa(cmd, args, {
        reject: false,
        timeout: options?.timeout,
      })
      return {
        exitCode: result.exitCode ?? 0,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
      }
    } catch (err) {
      // execa 不可用或命令不存在
      throw new Error(`执行命令失败 ${cmd}: ${this.formatError(err)}`)
    }
  }

  private formatError(err: unknown): string {
    if (err instanceof Error) return err.message
    return String(err)
  }
}
