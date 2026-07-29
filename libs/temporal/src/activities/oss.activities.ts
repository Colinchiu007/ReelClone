/**
 * OSS 对象存储 Activity
 *
 * 封装阿里云 OSS 上传与签名 URL 生成。
 * 真实模式下调用 libs/oss；Mock 模式下返回模拟 URL。
 */
import { Context } from '@temporalio/activity'
import { type OssActivities } from '../types'
import { isMockMode, mockDelay } from './mock.util'

/** 默认签名 URL 有效期（15 分钟） */
const DEFAULT_SIGNED_URL_TTL_SECONDS = 15 * 60

/**
 * 上传本地文件到 OSS
 * @param localPath 本地文件绝对路径
 * @param key OSS 对象 Key（如 works/2024/01/xxx.mp4）
 * @returns 访问 URL
 */
export async function uploadToOSS(localPath: string, key: string): Promise<string> {
  const ctx = Context.current()
  ctx.log.info('[OSS] 上传文件', { localPath, key })

  if (isMockMode()) {
    // TODO: 替换为真实 OSS 上传
    //   import { ossClient } from '@reelclone/oss'
    //   await ossClient.put(key, localPath)
    //   return ossClient.getSignedUrl(key)
    await mockDelay(200)
    const url = `https://mock-oss.reelclone.dev/${key}`
    ctx.log.info('[OSS][Mock] 上传完成', { url })
    return url
  }

  throw new Error('[OSS] 真实模式尚未接入 libs/oss')
}

/**
 * 生成签名 URL（短期有效，默认 15 分钟）
 * @param key OSS 对象 Key
 * @returns 签名 URL
 */
export async function generateSignedUrl(key: string): Promise<string> {
  const ctx = Context.current()
  ctx.log.info('[OSS] 生成签名 URL', { key })

  if (isMockMode()) {
    // TODO: 替换为真实签名
    //   import { ossClient } from '@reelclone/oss'
    //   return ossClient.signatureUrl(key, { expires: DEFAULT_SIGNED_URL_TTL_SECONDS })
    await mockDelay(50)
    const expires = Math.floor(Date.now() / 1000) + DEFAULT_SIGNED_URL_TTL_SECONDS
    return `https://mock-oss.reelclone.dev/${key}?expires=${expires}&signature=mock`
  }

  throw new Error('[OSS] 真实模式尚未接入 libs/oss')
}

/** OSS Activity 实现集合 */
export const ossActivities: OssActivities = {
  uploadToOSS,
  generateSignedUrl,
}
