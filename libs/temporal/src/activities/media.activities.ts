/**
 * 媒体处理 Activity
 *
 * 负责视频下载、FFmpeg 后处理、封面生成、内容安全审核。
 * 真实模式下调用 libs/ai 的 FFmpeg 封装与内容安全服务；
 * Mock 模式下返回模拟的 OSS Key 与审核结果。
 */
import { Context } from '@temporalio/activity'
import {
  ModerationDecision,
  type MediaActivities,
  type ModerationResult,
  type PostProcessConfig,
} from '../types'
import { isMockMode, mockId, mockDelay } from './mock.util'

/**
 * 下载视频到本地临时目录
 * @param url 视频 URL（Seedance 返回的成品 URL 或对标源 URL）
 * @returns 本地文件绝对路径
 */
export async function downloadVideo(url: string): Promise<string> {
  const ctx = Context.current()
  ctx.log.info('[Media] 下载视频', { url })

  if (isMockMode()) {
    // TODO: 替换为真实下载
    //   import { downloadAdapter } from '@reelclone/ai'
    //   return downloadAdapter.download(url, { dest: '/tmp/reelclone' })
    await mockDelay(300)
    const localPath = `/tmp/reelclone/${mockId('video')}.mp4`
    ctx.log.info('[Media][Mock] 视频已下载', { localPath })
    return localPath
  }

  throw new Error('[Media] 真实模式尚未接入 libs/ai 下载适配器')
}

/**
 * FFmpeg 后处理（转码 / 压缩 / 水印）
 * @param videoUrl 源视频 URL
 * @param config 后处理配置
 * @returns 处理后成品的 OSS Key
 */
export async function postProcessVideo(
  videoUrl: string,
  config: PostProcessConfig,
): Promise<string> {
  const ctx = Context.current()
  ctx.log.info('[Media] FFmpeg 后处理', { videoUrl, config })

  if (isMockMode()) {
    // TODO: 替换为真实 FFmpeg 调用
    //   import { ffmpegWrapper } from '@reelclone/ai'
    //   const localInput = await downloadVideo(videoUrl)
    //   const localOutput = await ffmpegWrapper.transcode(localInput, config)
    //   const ossKey = `works/${Date.now()}/output.mp4`
    //   await uploadToOSS(localOutput, ossKey)
    //   return ossKey
    await mockDelay(400)
    const ossKey = `works/${Date.now()}/${mockId('output')}.mp4`
    ctx.log.info('[Media][Mock] 后处理完成', { ossKey })
    return ossKey
  }

  throw new Error('[Media] 真实模式尚未接入 libs/ai FFmpeg 封装')
}

/**
 * 生成封面缩略图
 * @param videoPath 视频本地路径或 OSS Key
 * @returns 封面图 OSS Key
 */
export async function generateThumbnail(videoPath: string): Promise<string> {
  const ctx = Context.current()
  ctx.log.info('[Media] 生成封面', { videoPath })

  if (isMockMode()) {
    // TODO: 替换为真实 FFmpeg 抽帧
    //   import { ffmpegWrapper } from '@reelclone/ai'
    //   const frame = await ffmpegWrapper.extractFrame(videoPath, { time: 1 })
    //   const ossKey = `covers/${Date.now()}/cover.jpg`
    //   await uploadToOSS(frame, ossKey)
    //   return ossKey
    await mockDelay(200)
    const thumbnailKey = `covers/${Date.now()}/${mockId('cover')}.jpg`
    return thumbnailKey
  }

  throw new Error('[Media] 真实模式尚未接入 libs/ai FFmpeg 封装')
}

/**
 * 内容安全审核
 *
 * MVP 阶段：使用关键词黑名单过滤（基于 libs/ai ModerationService），
 *          对视频 Key、封面 Key 文本进行敏感词检测。
 *
 * ================================================
 * 后续接入点：替换为微信内容安全 API 或第三方服务
 * ================================================
 * 1. 微信小程序内容安全：wx.cloud.security.msgSecCheck / imgSecCheck
 * 2. 阿里云内容安全：Green SDK scanVideo / scanImage
 * 3. 腾讯云天御：TextModeration / ImageModeration
 *
 * 替换时只需修改下方 real-mode 分支，调用真实 API 并按其返回结构
 * 映射为 ModerationResult（passed / decision / reason / labels）。
 * 工作流侧无需改动。
 */
export async function moderateContent(
  videoKey: string,
  thumbnailKey: string,
): Promise<ModerationResult> {
  const ctx = Context.current()
  ctx.log.info('[Media] 内容安全审核', { videoKey, thumbnailKey })

  if (isMockMode()) {
    await mockDelay(250)
    return {
      passed: true,
      decision: ModerationDecision.PASSED,
      labels: [],
    }
  }

  // ---- 真实模式：MVP 关键词过滤（后续替换为微信/阿里云内容安全 API）----
  const { ModerationService } = await import('@reelclone/ai')
  const moderation = new ModerationService()

  // 对视频 Key 与封面 Key 进行文本审核（MVP 阶段基于关键词黑名单）
  const [videoResult, imageResult] = await Promise.all([
    moderation.moderateText(videoKey),
    moderation.moderateText(thumbnailKey),
  ])

  const allHits = [
    ...(videoResult.hitKeywords ?? []),
    ...(imageResult.hitKeywords ?? []),
  ]

  if (!videoResult.passed || !imageResult.passed) {
    const reason = videoResult.reason || imageResult.reason || '内容包含敏感词'
    ctx.log.warn('[Media] 内容安全审核未通过', { videoKey, thumbnailKey, hits: allHits })
    return {
      passed: false,
      decision: ModerationDecision.REJECTED,
      reason,
      labels: allHits,
    }
  }

  return {
    passed: true,
    decision: ModerationDecision.PASSED,
    labels: [],
  }
}

/** 媒体处理 Activity 实现集合 */
export const mediaActivities: MediaActivities = {
  downloadVideo,
  postProcessVideo,
  generateThumbnail,
  moderateContent,
}
