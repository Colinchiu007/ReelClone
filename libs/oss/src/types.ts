/**
 * @reelclone/oss 类型定义
 * 覆盖 OSS 配置、STS Token、上传凭证、文件元信息等核心数据结构
 */

/**
 * OSS 共享库配置
 * 由 oss.config.ts 工厂从环境变量读取或由 forRoot 显式传入
 */
export interface OSSConfig {
  /** 地域 ID，例如 oss-cn-hangzhou */
  region: string;
  /** 阿里云 AccessKey ID（主账号或子账号，用于服务端直传） */
  accessKeyId: string;
  /** 阿里云 AccessKey Secret */
  accessKeySecret: string;
  /** Bucket 名称 */
  bucket: string;
  /** 可选：自定义 Endpoint，例如 https://oss-cn-hangzhou.aliyuncs.com */
  endpoint?: string;
  /** STS 角色 ARN，用于签发小程序直传 Token；为空时进入 Mock 模式 */
  roleArn?: string;
  /** STS 会话名称，默认 reelclone-sts */
  roleSessionName?: string;
  /** 是否强制启用 Mock 模式（无环境变量时自动启用） */
  mock?: boolean;
  /** 上传单文件大小上限（字节），默认 100MB，用于 Policy 限制 */
  maxContentLength?: number;
}

/**
 * STS 临时凭证
 * 由 STSService.assumeRole 签发，下发给小程序用于直传 OSS
 */
export interface STSToken {
  /** 临时 AccessKey ID */
  accessKeyId: string;
  /** 临时 AccessKey Secret */
  accessKeySecret: string;
  /** 安全令牌（SecurityToken） */
  securityToken: string;
  /** 过期时间（ISO 8601 字符串，例如 2025-12-31T23:59:59Z） */
  expiration: string;
  /** Bucket 名称 */
  bucket: string;
  /** 地域 ID */
  region: string;
  /** Bucket 访问域名，例如 https://reelclone-assets.oss-cn-hangzhou.aliyuncs.com */
  host: string;
}

/**
 * 小程序表单上传 Policy（Base64 编码前的原始结构）
 * 参考：https://help.aliyun.com/zh/oss/developer-reference/postobject
 */
export interface UploadPolicy {
  /** Policy 过期时间（ISO 8601 字符串） */
  expiration: string;
  /**
   * 上传约束条件数组，常见形态：
   * - { bucket: 'xxx' }
   * - ['starts-with', '$key', 'assets/{userId}/']
   * - ['content-length-range', 0, 104857600]
   */
  conditions: Array<Record<string, string> | Array<string | number>>;
}

/**
 * 完整上传凭证
 * 小程序直传所需的全部信息：STS Token + 表单 Policy + Signature + 上传目标
 */
export interface UploadToken {
  /** 关联的 STS Token（用于客户端 SDK 直传场景） */
  stsToken: STSToken;
  /** Base64 编码后的 Policy 字符串 */
  policy: string;
  /** 用 AccessKeySecret + Policy 计算出的签名 */
  signature: string;
  /** 表单上传目标地址，例如 https://bucket.oss-cn-hangzhou.aliyuncs.com */
  uploadHost: string;
  /** 推荐的对象 Key（可选，调用方也可使用 key-generator 自行生成） */
  key?: string;
  /** 凭证有效期（秒），与 Policy.expiration 对应 */
  expireSeconds: number;
}

/**
 * 文件元信息
 * 由 OSSService.getMetadata 返回
 */
export interface FileMetadata {
  /** 文件大小（字节） */
  size: number;
  /** MIME 类型，例如 image/png */
  mimeType: string;
  /** OSS 返回的 ETag */
  etag: string;
  /** 最后修改时间 */
  lastModified: Date;
}

/**
 * OSS 服务统一返回的上传结果
 */
export interface UploadResult {
  /** 文件可访问 URL（公有 Bucket 或签名 URL） */
  url: string;
  /** OSS 对象 Key */
  key: string;
}
