/**
 * 平台识别工具
 *
 * 根据对标视频 URL 识别所属平台（抖音/小红书/B站/快手/微博/视频号）。
 * 识别失败时返回 null，由调用方抛出 UNSUPPORTED_PLATFORM 错误。
 */
import { BenchmarkPlatform } from '@reelclone/database';

/** 平台域名匹配规则（按优先级排序） */
const PLATFORM_RULES: ReadonlyArray<{ platform: BenchmarkPlatform; domains: readonly string[] }> = [
  {
    platform: BenchmarkPlatform.DOUYIN,
    domains: ['douyin.com', 'iesdouyin.com', 'v.douyin.com'],
  },
  {
    platform: BenchmarkPlatform.XIAOHONGSHU,
    domains: ['xiaohongshu.com', 'xhslink.com'],
  },
  {
    platform: BenchmarkPlatform.BILIBILI,
    domains: ['bilibili.com', 'b23.tv'],
  },
  {
    platform: BenchmarkPlatform.KUAISHOU,
    domains: ['kuaishou.com', 'chenzhongtech.com'],
  },
  {
    platform: BenchmarkPlatform.WEIBO,
    domains: ['weibo.com', 'weibo.cn'],
  },
  {
    platform: BenchmarkPlatform.WECHAT_VIDEO,
    domains: ['channels.weixin.qq.com'],
  },
];

/**
 * 从 URL 中提取主机名（小写）
 * 支持 http/https 协议，也支持无协议的裸域名
 */
function extractHostname(url: string): string {
  const trimmed = url.trim().toLowerCase();
  // 去除协议
  const withoutProtocol = trimmed.replace(/^https?:\/\//, '');
  // 取第一个 / 或 ? 之前的部分作为主机名
  const hostname = withoutProtocol.split(/[/?#]/)[0];
  return hostname;
}

/**
 * 根据视频 URL 识别平台
 *
 * @param url 视频链接
 * @returns 平台枚举值，识别失败返回 null
 *
 * @example
 * detectPlatform('https://www.douyin.com/video/123') // BenchmarkPlatform.DOUYIN
 * detectPlatform('https://channels.weixin.qq.com/xxx') // BenchmarkPlatform.WECHAT_VIDEO
 * detectPlatform('https://example.com') // null
 */
export function detectPlatform(url: string): BenchmarkPlatform | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const hostname = extractHostname(url);
  if (!hostname) {
    return null;
  }

  for (const rule of PLATFORM_RULES) {
    for (const domain of rule.domains) {
      // 精确匹配或子域名匹配（如 www.douyin.com 匹配 douyin.com）
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return rule.platform;
      }
    }
  }

  return null;
}
