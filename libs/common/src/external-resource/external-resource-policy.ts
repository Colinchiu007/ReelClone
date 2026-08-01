/**
 * ExternalResourcePolicy — 外部资源访问安全策略（E1 — SSRF 防护）
 *
 * 职责：
 *  1. 结构化 URL 校验（scheme、hostname）
 *  2. 严格 host allowlist（子域名匹配）
 *  3. 私网/回环/保留网段拒绝（IPv4 + IPv6）
 *  4. redirect 逐跳复核（scheme、host、私网检测、深度限制）
 *  5. 响应大小/时长限制（暴露配置供调用方执行）
 *  6. DNS rebinding 防护（提供 isPrivateAddress 供调用方在 DNS 解析后检查）
 *
 * 集成点：libs/ai/src/downloader/video-downloader.service.ts
 *  - download() 调用前执行 validateUrl()
 *  - HTTP 客户端 redirect 回调中调用 validateRedirect()
 *  - DNS 解析后调用 isPrivateAddress() 复核
 */
import { isIP } from 'node:net'

// -------------------- 错误码与异常 --------------------

/**
 * 外部资源访问错误码
 */
export enum ExternalResourceErrorCode {
  /** URL 格式不合法 */
  INVALID_URL = 'INVALID_URL',
  /** scheme 不允许（非 http/https） */
  SCHEME_NOT_ALLOWED = 'SCHEME_NOT_ALLOWED',
  /** host 不在 allowlist 中 */
  HOST_NOT_ALLOWED = 'HOST_NOT_ALLOWED',
  /** 私网/回环/保留地址 */
  PRIVATE_ADDRESS = 'PRIVATE_ADDRESS',
  /** redirect 目标为私网地址 */
  REDIRECT_TO_PRIVATE = 'REDIRECT_TO_PRIVATE',
  /** redirect 链过长 */
  REDIRECT_CHAIN_TOO_LONG = 'REDIRECT_CHAIN_TOO_LONG',
  /** 响应体超过大小限制 */
  RESPONSE_TOO_LARGE = 'RESPONSE_TOO_LARGE',
  /** 响应超时 */
  RESPONSE_TIMEOUT = 'RESPONSE_TIMEOUT',
}

/**
 * 外部资源访问异常
 *
 * 所有 SSRF 防护相关拒绝均抛出此异常，携带错误码与相关 URL。
 */
export class ExternalResourceError extends Error {
  constructor(
    message: string,
    public readonly code: ExternalResourceErrorCode,
    public readonly url?: string,
  ) {
    super(message)
    this.name = 'ExternalResourceError'
    // 维持原型链（继承 Error 的标准做法）
    Object.setPrototypeOf(this, ExternalResourceError.prototype)
  }
}

// -------------------- 接口定义 --------------------

/**
 * 外部资源访问安全策略接口
 *
 * 由 ExternalResourcePolicyService 实现，通过 ExternalResourceModule 注册到 NestJS DI。
 */
export interface ExternalResourcePolicy {
  /**
   * 验证外部 URL 是否安全可访问
   * @throws ExternalResourceError 如果 URL 不合法或存在安全风险
   */
  validateUrl(url: string): void

  /**
   * 获取允许的 host allowlist
   */
  getAllowedHosts(): string[]

  /**
   * 检查 DNS 解析结果是否为私网/回环/保留地址
   * @returns true 如果地址被拒绝
   */
  isPrivateAddress(ip: string): boolean

  /**
   * 验证 redirect 目标是否安全
   *
   * 每次 redirect 都需重新验证 scheme、host、私网地址。
   *
   * @param fromUrl 源 URL
   * @param toUrl 目标 URL
   * @param redirectDepth 当前 redirect 深度（从 1 开始），超过 maxRedirectDepth 时拒绝
   * @throws ExternalResourceError 如果 redirect 目标不安全或链路过长
   */
  validateRedirect(fromUrl: string, toUrl: string, redirectDepth?: number): void
}

// -------------------- 配置选项 --------------------

/**
 * ExternalResourcePolicy 配置选项
 *
 * 未提供时使用默认值。可通过 ExternalResourceModule 工厂从环境变量注入。
 */
export interface ExternalResourcePolicyOptions {
  /** 允许的 host 列表（小写，含子域名自动匹配） */
  allowedHosts?: string[]
  /** 最大 redirect 深度，默认 5 */
  maxRedirectDepth?: number
  /** 最大响应体大小（字节），默认 500MB */
  maxResponseBytes?: number
  /** 最大响应时长（毫秒），默认 60s */
  maxResponseMs?: number
}

// -------------------- 默认 allowlist --------------------

/**
 * 默认允许的视频平台 host 列表
 *
 * 包含 5 大平台主域名 + 常见短链/移动域名。
 * 子域名（如 www.）会自动匹配父域名。
 */
const DEFAULT_ALLOWED_HOSTS: string[] = [
  // YouTube
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  // 哔哩哔哩
  'bilibili.com',
  'www.bilibili.com',
  'm.bilibili.com',
  'b23.tv',
  // 抖音
  'douyin.com',
  'www.douyin.com',
  'v.douyin.com',
  'iesdouyin.com',
  // 快手
  'kuaishou.com',
  'www.kuaishou.com',
  // 小红书
  'xiaohongshu.com',
  'www.xiaohongshu.com',
  'xhslink.com',
  // 微博
  'weibo.com',
  'weibo.cn',
]

// -------------------- IPv4 工具函数 --------------------

/**
 * 将 IPv4 字符串解析为无符号 32 位整数
 *
 * 注意：JavaScript 位运算是 32 位有符号的，使用 >>> 0 转为无符号。
 */
function parseIpv4(ip: string): number {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    throw new Error(`Invalid IPv4 address: ${ip}`)
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

/**
 * 检查 IPv4 是否在指定 CIDR 范围内
 */
function isIpv4InCidr(ip: number, network: number, maskBits: number): boolean {
  if (maskBits === 0) return true
  const mask = (0xffffffff << (32 - maskBits)) >>> 0
  return (ip & mask) === (network & mask)
}

// -------------------- IPv6 工具函数 --------------------

/**
 * 将 8 组 16 位十六进制段转为 128 位 BigInt
 */
function ipv6PartsToBigInt(parts: string[]): bigint {
  let result = 0n
  for (const part of parts) {
    if (part === '') {
      throw new Error(`Invalid IPv6 group: empty`)
    }
    const num = Number.parseInt(part, 16)
    if (Number.isNaN(num) || num < 0 || num > 0xffff) {
      throw new Error(`Invalid IPv6 group: ${part}`)
    }
    result = (result << 16n) | BigInt(num)
  }
  return result
}

/**
 * 将 IPv6 字符串解析为 128 位 BigInt
 *
 * 支持：
 *  - 完整表示：2001:0db8:0000:0000:0000:0000:0000:0001
 *  - 压缩表示：2001:db8::1
 *  - IPv4-mapped：::ffff:192.0.2.1
 */
function parseIpv6(ip: string): bigint {
  const parts = ip.split('::')
  if (parts.length > 2) {
    throw new Error(`Invalid IPv6 address: ${ip}`)
  }

  let head: string[]
  let tail: string[]

  if (parts.length === 2) {
    head = parts[0] ? parts[0].split(':') : []
    tail = parts[1] ? parts[1].split(':') : []
  } else {
    head = parts[0].split(':')
    tail = []
  }

  // 处理 IPv4-mapped 末尾（如 ::ffff:192.0.2.1）
  if (tail.length > 0) {
    const lastTail = tail[tail.length - 1]
    if (lastTail.includes('.')) {
      const v4Parts = lastTail.split('.').map(Number)
      if (v4Parts.length !== 4 || v4Parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
        throw new Error(`Invalid IPv4-mapped IPv6 address: ${ip}`)
      }
      const high = ((v4Parts[0] << 8) | v4Parts[1]).toString(16)
      const low = ((v4Parts[2] << 8) | v4Parts[3]).toString(16)
      tail = [...tail.slice(0, -1), high, low]
    }
  }

  if (parts.length === 2) {
    // 含 :: 压缩
    const totalGroups = head.length + tail.length
    const missingGroups = 8 - totalGroups
    if (missingGroups < 1) {
      throw new Error(`Invalid IPv6 address: ${ip}`)
    }
    const allParts = [...head, ...Array(missingGroups).fill('0'), ...tail]
    return ipv6PartsToBigInt(allParts)
  } else {
    // 不含 :: 压缩，必须 8 组
    if (head.length !== 8) {
      throw new Error(`Invalid IPv6 address: ${ip}`)
    }
    return ipv6PartsToBigInt(head)
  }
}

/**
 * 检查 IPv6 是否在指定前缀范围内
 */
function isIpv6InPrefix(ip: bigint, network: bigint, prefixBits: number): boolean {
  if (prefixBits === 0) return true
  const mask = ((1n << BigInt(prefixBits)) - 1n) << BigInt(128 - prefixBits)
  return (ip & mask) === (network & mask)
}

// -------------------- IPv4/IPv6 私网检测 --------------------

/**
 * IPv4 私网/保留网段（CIDR 表示）
 */
const PRIVATE_IPV4_CIDRS: ReadonlyArray<{ network: number; maskBits: number; label: string }> = [
  { network: parseIpv4('127.0.0.0'), maskBits: 8, label: 'loopback 127.0.0.0/8' },
  { network: parseIpv4('10.0.0.0'), maskBits: 8, label: 'private 10.0.0.0/8' },
  { network: parseIpv4('172.16.0.0'), maskBits: 12, label: 'private 172.16.0.0/12' },
  { network: parseIpv4('192.168.0.0'), maskBits: 16, label: 'private 192.168.0.0/16' },
  { network: parseIpv4('169.254.0.0'), maskBits: 16, label: 'link-local 169.254.0.0/16' },
  { network: parseIpv4('0.0.0.0'), maskBits: 8, label: 'current-network 0.0.0.0/8' },
  { network: parseIpv4('100.64.0.0'), maskBits: 10, label: 'cgnat 100.64.0.0/10' },
]

/**
 * IPv6 私网/保留网段（前缀长度表示）
 *
 * 注意：`::`（未指定地址）使用 prefixBits=128 精确匹配，
 * 不能用 prefixBits=0（会匹配所有 IPv6 地址）。
 */
const PRIVATE_IPV6_PREFIXES: ReadonlyArray<{ network: bigint; prefixBits: number; label: string }> =
  [
    {
      network: parseIpv6('::'),
      prefixBits: 128,
      label: 'unspecified ::/128',
    },
    {
      network: parseIpv6('::1'),
      prefixBits: 128,
      label: 'loopback ::1/128',
    },
    {
      network: parseIpv6('fc00::'),
      prefixBits: 7,
      label: 'unique-local fc00::/7',
    },
    {
      network: parseIpv6('fe80::'),
      prefixBits: 10,
      label: 'link-local fe80::/10',
    },
  ]

/**
 * 云元数据服务地址（精确匹配）
 *
 * 即使不在 CIDR 范围内也需单独拒绝：
 *  - 169.254.169.254 — AWS/GCP/Azure 元数据服务（实际在 169.254.0.0/16 内，双重保险）
 *  - 100.100.100.200 — 阿里云元数据服务（不在标准私网 CIDR 内）
 */
const METADATA_IPS: ReadonlySet<string> = new Set(['169.254.169.254', '100.100.100.200'])

// -------------------- URL 校验内部工具 --------------------

/**
 * 允许的 scheme 集合
 */
const ALLOWED_SCHEMES = new Set(['http:', 'https:'])

/**
 * 解析后的 URL 信息
 */
interface ParsedUrlInfo {
  /** 完整 URL */
  url: string
  /** scheme（含冒号，如 "https:"） */
  scheme: string
  /** 小写 hostname（IPv6 不含方括号） */
  hostname: string
  /** hostname 是否为字面量 IP（isIP 返回 4 或 6） */
  ipVersion: 0 | 4 | 6
}

/**
 * 解析并校验 URL，返回结构化信息
 *
 * 此函数不检查 host allowlist 与私网地址，仅做 URL 语法层面校验。
 * 调用方根据返回值做进一步安全判断。
 */
function parseUrl(url: string): ParsedUrlInfo {
  if (typeof url !== 'string' || url.trim() === '') {
    throw new ExternalResourceError(
      'URL 为空或非字符串',
      ExternalResourceErrorCode.INVALID_URL,
      url,
    )
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new ExternalResourceError(
      `URL 格式不合法: ${url}`,
      ExternalResourceErrorCode.INVALID_URL,
      url,
    )
  }

  // 拒绝携带 credentials 的 URL（防止 http://user:pass@host 或 http://youtube.com@evil.com 注入）
  if (parsed.username || parsed.password) {
    throw new ExternalResourceError(
      `URL 不允许携带 credentials: ${url}`,
      ExternalResourceErrorCode.INVALID_URL,
      url,
    )
  }

  const scheme = parsed.protocol.toLowerCase()
  if (!ALLOWED_SCHEMES.has(scheme)) {
    throw new ExternalResourceError(
      `不允许的 scheme "${scheme}"，仅支持 http/https`,
      ExternalResourceErrorCode.SCHEME_NOT_ALLOWED,
      url,
    )
  }

  // URL.hostname 在不同 Node 版本中对 IPv6 返回形式不一致：
  //  - 部分版本返回 "::1"（无方括号）
  //  - 部分版本返回 "[::1]"（带方括号）
  // 统一去除首尾方括号，保证 isIP() 能正确识别
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (hostname === '') {
    throw new ExternalResourceError(
      `URL hostname 为空: ${url}`,
      ExternalResourceErrorCode.INVALID_URL,
      url,
    )
  }

  const ipVersion = isIP(hostname) as 0 | 4 | 6

  return {
    url,
    scheme,
    hostname,
    ipVersion,
  }
}

// -------------------- 实现类 --------------------

/**
 * ExternalResourcePolicy 默认实现
 *
 * 通过 ExternalResourceModule 注册到 NestJS DI，供 VideoDownloaderService 注入。
 *
 * 安全策略：
 *  1. URL 必须为 http/https scheme
 *  2. hostname 必须在 allowlist 中（支持子域名匹配）
 *  3. 字面量 IP 必须不是私网/回环/保留地址
 *  4. redirect 需逐跳重新校验，且深度不超过 maxRedirectDepth
 *
 * 用法：
 * ```typescript
 * constructor(private readonly policy: ExternalResourcePolicyService) {}
 *
 * download(url: string) {
 *   this.policy.validateUrl(url)
 *   // ... 执行下载
 * }
 * ```
 */
export class ExternalResourcePolicyService implements ExternalResourcePolicy {
  /** 允许的 host 集合（小写） */
  private readonly allowedHosts: Set<string>
  /** 最大 redirect 深度 */
  readonly maxRedirectDepth: number
  /** 最大响应体大小（字节） */
  readonly maxResponseBytes: number
  /** 最大响应时长（毫秒） */
  readonly maxResponseMs: number

  constructor(options?: ExternalResourcePolicyOptions) {
    const hosts = options?.allowedHosts ?? DEFAULT_ALLOWED_HOSTS
    this.allowedHosts = new Set(hosts.map((h) => h.toLowerCase().trim()).filter(Boolean))

    this.maxRedirectDepth = options?.maxRedirectDepth ?? 5
    this.maxResponseBytes = options?.maxResponseBytes ?? 500 * 1024 * 1024 // 500MB
    this.maxResponseMs = options?.maxResponseMs ?? 60_000 // 60s
  }

  // -------------------- 接口实现 --------------------

  /**
   * 验证外部 URL 是否安全可访问
   *
   * 校验流程：
   *  1. URL 语法解析（scheme、hostname、credentials）
   *  2. 字面量 IP 私网检测
   *  3. host allowlist 校验（子域名匹配）
   *
   * @throws ExternalResourceError 校验失败时抛出
   */
  validateUrl(url: string): void {
    const info = parseUrl(url)

    // 字面量 IP：先做私网检测
    if (info.ipVersion !== 0) {
      if (this.isPrivateAddress(info.hostname)) {
        throw new ExternalResourceError(
          `URL 指向私网/保留地址: ${info.hostname}`,
          ExternalResourceErrorCode.PRIVATE_ADDRESS,
          url,
        )
      }
      // 公网 IP 也不允许（未在 allowlist 中）
      if (!this.isHostAllowed(info.hostname)) {
        throw new ExternalResourceError(
          `host 不在允许列表中: ${info.hostname}`,
          ExternalResourceErrorCode.HOST_NOT_ALLOWED,
          url,
        )
      }
      return
    }

    // 域名：校验 allowlist
    if (!this.isHostAllowed(info.hostname)) {
      throw new ExternalResourceError(
        `host 不在允许列表中: ${info.hostname}`,
        ExternalResourceErrorCode.HOST_NOT_ALLOWED,
        url,
      )
    }
  }

  /**
   * 获取允许的 host allowlist（返回副本，防止外部修改）
   */
  getAllowedHosts(): string[] {
    return Array.from(this.allowedHosts)
  }

  /**
   * 检查 IP 是否为私网/回环/保留地址
   *
   * 覆盖：
   *  - IPv4: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
   *          169.254.0.0/16, 0.0.0.0/8, 100.64.0.0/10
   *  - IPv6: ::1/128, fc00::/7, fe80::/10, ::
   *  - IPv4-mapped IPv6: ::ffff:x.x.x.x（提取内嵌 IPv4 后按 IPv4 规则检查）
   *  - 云元数据: 169.254.169.254, 100.100.100.200
   *
   * @param ip IP 地址字符串（IPv4 或 IPv6）
   * @returns true 如果地址应被拒绝
   */
  isPrivateAddress(ip: string): boolean {
    const trimmed = ip.trim()
    if (trimmed === '') return false

    // 精确匹配云元数据地址
    if (METADATA_IPS.has(trimmed)) return true

    const version = isIP(trimmed)
    if (version === 0) return false // 非法 IP，不认为是私网

    if (version === 4) {
      try {
        const ipInt = parseIpv4(trimmed)
        return PRIVATE_IPV4_CIDRS.some((range) =>
          isIpv4InCidr(ipInt, range.network, range.maskBits),
        )
      } catch {
        return false
      }
    }

    if (version === 6) {
      try {
        const ipBig = parseIpv6(trimmed)

        // 先检查 IPv6 私网范围
        if (
          PRIVATE_IPV6_PREFIXES.some((prefix) =>
            isIpv6InPrefix(ipBig, prefix.network, prefix.prefixBits),
          )
        ) {
          return true
        }

        // 检查 IPv4-mapped IPv6（::ffff:0:0/96）
        // 前 96 位为 0:0:0:0:0:ffff，后 32 位为内嵌 IPv4
        // (ipBig >> 32n) 得到前 96 位，应为 0xffffn
        const high96 = ipBig >> 32n
        if (high96 === 0xffffn) {
          // 提取内嵌 IPv4（最后 32 位）并按 IPv4 规则检查
          const v4Int = Number(ipBig & 0xffffffffn) >>> 0
          return PRIVATE_IPV4_CIDRS.some((range) =>
            isIpv4InCidr(v4Int, range.network, range.maskBits),
          )
        }

        return false
      } catch {
        return false
      }
    }

    return false
  }

  /**
   * 验证 redirect 目标是否安全
   *
   * 校验流程：
   *  1. redirect 深度检查（超过 maxRedirectDepth 拒绝）
   *  2. 目标 URL 完整校验（scheme、host、私网检测）
   *  3. 私网 redirect 检测（使用 REDIRECT_TO_PRIVATE 区分上下文）
   *
   * @param fromUrl 源 URL（已校验，此处不重复校验）
   * @param toUrl 目标 URL
   * @param redirectDepth 当前 redirect 深度，从 1 开始；未提供时默认 1
   */
  validateRedirect(fromUrl: string, toUrl: string, redirectDepth?: number): void {
    const depth = redirectDepth ?? 1
    if (depth > this.maxRedirectDepth) {
      throw new ExternalResourceError(
        `redirect 链过长: 已 ${depth} 跳，最大 ${this.maxRedirectDepth}`,
        ExternalResourceErrorCode.REDIRECT_CHAIN_TOO_LONG,
        toUrl,
      )
    }

    const info = parseUrl(toUrl)

    // 字面量 IP redirect 检测
    if (info.ipVersion !== 0) {
      if (this.isPrivateAddress(info.hostname)) {
        throw new ExternalResourceError(
          `redirect 目标指向私网/保留地址: ${info.hostname}（from=${fromUrl}）`,
          ExternalResourceErrorCode.REDIRECT_TO_PRIVATE,
          toUrl,
        )
      }
      if (!this.isHostAllowed(info.hostname)) {
        throw new ExternalResourceError(
          `redirect 目标 host 不在允许列表中: ${info.hostname}`,
          ExternalResourceErrorCode.HOST_NOT_ALLOWED,
          toUrl,
        )
      }
      return
    }

    // 域名 redirect 检测
    if (!this.isHostAllowed(info.hostname)) {
      throw new ExternalResourceError(
        `redirect 目标 host 不在允许列表中: ${info.hostname}`,
        ExternalResourceErrorCode.HOST_NOT_ALLOWED,
        toUrl,
      )
    }
  }

  // -------------------- 内部方法 --------------------

  /**
   * 检查 hostname 是否在 allowlist 中
   *
   * 匹配规则：
   *  - 精确匹配：hostname === allowed
   *  - 子域名匹配：hostname 以 `.${allowed}` 结尾
   *
   * 示例（allowlist 含 "youtube.com"）：
   *  - "youtube.com" → 匹配（精确）
   *  - "www.youtube.com" → 匹配（子域名）
   *  - "evil-youtube.com" → 不匹配（非 `.` 分隔）
   *  - "notyoutube.com" → 不匹配
   */
  private isHostAllowed(hostname: string): boolean {
    const lower = hostname.toLowerCase()
    for (const allowed of this.allowedHosts) {
      if (lower === allowed) return true
      // 子域名匹配：确保以 `.allowed` 结尾，避免 evil-youtube.com 误匹配
      if (lower.endsWith('.' + allowed)) return true
    }
    return false
  }
}
