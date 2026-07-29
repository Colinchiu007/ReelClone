/**
 * OSS 配置工厂
 * 负责从环境变量读取阿里云 OSS 配置，并判定是否进入 Mock 模式
 *
 * 环境变量约定（见仓库根 .env.example）：
 * - OSS_REGION            地域 ID
 * - OSS_ACCESS_KEY_ID     主账号 / 子账号 AccessKey ID
 * - OSS_ACCESS_KEY_SECRET 主账号 / 子账号 AccessKey Secret
 * - OSS_BUCKET            Bucket 名称
 * - OSS_ENDPOINT          可选自定义 Endpoint
 * - OSS_ROLE_ARN          STS 角色 ARN（用于小程序直传）
 * - OSS_ROLE_SESSION_NAME STS 会话名称，默认 reelclone-sts
 * - OSS_MOCK              显式 Mock 开关（'true' / '1' 启用）
 * - OSS_MAX_CONTENT_LENGTH 上传单文件大小上限（字节），默认 100MB
 */

import { OSSConfig } from '../types';

/** 默认会话名称 */
const DEFAULT_ROLE_SESSION_NAME = 'reelclone-sts';
/** 默认单文件大小上限：100MB */
const DEFAULT_MAX_CONTENT_LENGTH = 100 * 1024 * 1024;
/** Mock 模式下使用的占位 Bucket / Region */
const MOCK_REGION = 'oss-cn-hangzhou';
const MOCK_BUCKET = 'reelclone-mock';

/**
 * 判定字符串是否为布尔真值
 */
function isTruthyFlag(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

/**
 * 从 process.env 读取 OSS 配置
 * 当 OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET 任一缺失，或显式 OSS_MOCK=true 时，
 * 自动进入 Mock 模式，返回占位配置。Mock 模式下 STS Service 会返回模拟 Token，便于本地开发与小程序调试。
 */
export function loadOSSConfig(env: NodeJS.ProcessEnv = process.env): OSSConfig {
  const region = env.OSS_REGION ?? MOCK_REGION;
  const accessKeyId = env.OSS_ACCESS_KEY_ID ?? '';
  const accessKeySecret = env.OSS_ACCESS_KEY_SECRET ?? '';
  const bucket = env.OSS_BUCKET ?? '';
  const endpoint = env.OSS_ENDPOINT;
  const roleArn = env.OSS_ROLE_ARN;
  const roleSessionName = env.OSS_ROLE_SESSION_NAME ?? DEFAULT_ROLE_SESSION_NAME;

  const maxContentLength = env.OSS_MAX_CONTENT_LENGTH
    ? Number(env.OSS_MAX_CONTENT_LENGTH)
    : DEFAULT_MAX_CONTENT_LENGTH;

  // 关键凭证缺失，或显式开启 Mock，进入 Mock 模式
  const mock =
    isTruthyFlag(env.OSS_MOCK) ||
    !accessKeyId ||
    !accessKeySecret ||
    !bucket;

  return {
    region,
    accessKeyId: mock ? 'mock-access-key-id' : accessKeyId,
    accessKeySecret: mock ? 'mock-access-key-secret' : accessKeySecret,
    bucket: mock ? MOCK_BUCKET : bucket,
    endpoint,
    roleArn,
    roleSessionName,
    mock,
    maxContentLength,
  };
}

/**
 * NestJS ConfigFactory 兼容的注册函数
 * 配合 @nestjs/config 的 registerFactory / forRoot(loadOSSConfig) 使用
 */
export const ossConfigFactory = () => loadOSSConfig();

/**
 * NestJS ConfigFactory 命名空间键
 * 注入时使用 ConfigService.get<OSSConfig>('oss')
 */
export const OSS_CONFIG_KEY = 'oss';
