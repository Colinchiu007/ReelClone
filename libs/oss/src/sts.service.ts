/**
 * STS Token 服务
 * 为小程序直传 OSS 签发临时凭证，并生成表单上传所需的 Policy + Signature
 *
 * 设计要点：
 * - 通过 NestJS @Injectable() 装饰，复用 OSSModule 注入的 OSSConfig
 * - 真实模式下使用 @alicloud/sts20150401 调用 STS AssumeRole 接口
 * - Mock 模式下返回模拟 STS Token，便于本地开发与小程序调试
 * - 权限策略：仅允许上传 / 读取 / 列出指定前缀下的对象，显式 Deny 删除操作
 * - 动态加载 STS SDK，避免在 Mock 模式或未安装依赖时影响启动
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Inject, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { OSS_CONFIG_TOKEN } from './oss.service';
import { OSSConfig, STSToken, UploadPolicy, UploadToken } from './types';

/**
 * STS Token 服务
 */
@Injectable()
export class STSService {
  private readonly logger = new Logger(STSService.name);
  private readonly config: OSSConfig;
  /** 缓存的 STS SDK 客户端实例 */
  private stsClient: any = null;

  constructor(@Inject(OSS_CONFIG_TOKEN) config: OSSConfig) {
    this.config = config;
    if (config.mock) {
      this.logger.warn(
        'STSService 处于 Mock 模式：将返回模拟 STS Token，便于本地开发',
      );
    }
  }

  /** 是否处于 Mock 模式 */
  isMock(): boolean {
    return this.config.mock === true;
  }

  /**
   * 签发 STS Token
   * 权限策略：仅允许上传 / 读取 / 列出指定 resourcePrefix 下的对象
   *
   * @param userId         用户 ID（用于 roleSessionName 标识）
   * @param resourcePrefix 资源前缀，例如 assets/image/{userId}
   * @param expireSeconds  有效期（秒），默认 3600（1 小时）
   */
  async assumeRole(
    userId: string,
    resourcePrefix: string,
    expireSeconds: number = 3600,
  ): Promise<STSToken> {
    if (this.isMock()) {
      return this.mockAssumeRole(userId, resourcePrefix, expireSeconds);
    }
    if (!this.config.roleArn) {
      throw new Error(
        '未配置 OSS_ROLE_ARN，无法签发真实 STS Token；请配置角色 ARN 或切换 Mock 模式',
      );
    }

    const client = await this.ensureSTSClient();
    const policy = this.buildRolePolicy(resourcePrefix);
    const { AssumeRoleRequest } = await import('@alicloud/sts20150401');
    const request = new AssumeRoleRequest({
      roleArn: this.config.roleArn,
      roleSessionName: `${this.config.roleSessionName ?? 'reelclone-sts'}-${userId}`,
      durationSeconds: expireSeconds,
      policy: JSON.stringify(policy),
    });

    const response = await client.assumeRole(request);
    const credentials = response?.body?.credentials;
    if (!credentials) {
      throw new Error('STS assumeRole 响应缺少 credentials 字段');
    }

    return {
      accessKeyId: credentials.accessKeyId,
      accessKeySecret: credentials.accessKeySecret,
      securityToken: credentials.securityToken,
      expiration: credentials.expiration,
      bucket: this.config.bucket,
      region: this.config.region,
      host: this.getBucketHost(),
    };
  }

  /**
   * 生成完整上传凭证（STS Token + Policy + Signature）
   * 小程序可根据场景选择：
   *   - 使用 stsToken 走 OSS SDK 直传
   *   - 使用 policy + signature 走表单 PostObject 上传
   *
   * @param userId         用户 ID
   * @param resourcePrefix 资源前缀（建议包含 userId，确保隔离）
   * @param expireSeconds  凭证有效期（秒），默认 3600
   * @param key            可选预生成 Key（需在 resourcePrefix 之下）
   */
  async generateUploadToken(
    userId: string,
    resourcePrefix: string,
    expireSeconds: number = 3600,
    key?: string,
  ): Promise<UploadToken> {
    const stsToken = await this.assumeRole(userId, resourcePrefix, expireSeconds);
    const { policyBase64 } = this.buildUploadPolicy(
      resourcePrefix,
      expireSeconds,
    );
    const signature = this.signPolicy(policyBase64);
    return {
      stsToken,
      policy: policyBase64,
      signature,
      uploadHost: this.getBucketHost(),
      key,
      expireSeconds,
    };
  }

  /**
   * 仅生成表单上传 Policy（Base64）与签名，不签发 STS Token
   * 适用于直接使用主账号 AK 进行表单上传的场景
   */
  async generateFormPolicy(
    resourcePrefix: string,
    expireSeconds: number = 3600,
  ): Promise<{ policy: string; signature: string; policyObject: UploadPolicy }> {
    const { policy: policyObject, policyBase64 } = this.buildUploadPolicy(
      resourcePrefix,
      expireSeconds,
    );
    return {
      policy: policyBase64,
      signature: this.signPolicy(policyBase64),
      policyObject,
    };
  }

  /**
   * 构造 STS AssumeRole 用的权限策略
   * 仅允许在前缀下做 PutObject / GetObject / HeadObject / ListObjects
   * 显式 Deny 删除与 Bucket 级操作
   */
  private buildRolePolicy(resourcePrefix: string): Record<string, unknown> {
    const prefix = resourcePrefix.replace(/^\/+|\/+$/g, '');
    const resourceArnPrefix = `acs:oss:*:*:${this.config.bucket}/${prefix}`;
    return {
      Version: '1',
      Statement: [
        {
          Effect: 'Allow',
          Action: [
            'oss:PutObject',
            'oss:GetObject',
            'oss:HeadObject',
            'oss:ListObjects',
          ],
          Resource: [`${resourceArnPrefix}*`, `${resourceArnPrefix}/*`],
        },
        {
          Effect: 'Deny',
          Action: [
            'oss:DeleteObject',
            'oss:DeleteObjectVersion',
            'oss:DeleteBucket',
            'oss:PutBucketAcl',
            'oss:DeleteBucketAcl',
          ],
          Resource: '*',
        },
      ],
    };
  }

  /**
   * 构造表单上传 Policy
   * 限制：
   *   - 目标 Bucket
   *   - Key 必须以指定前缀开头（确保用户隔离）
   *   - 文件大小不超过 maxContentLength
   */
  private buildUploadPolicy(
    resourcePrefix: string,
    expireSeconds: number,
  ): { policy: UploadPolicy; policyBase64: string } {
    const prefix = resourcePrefix.replace(/^\/+|\/+$/g, '');
    const expirationDate = new Date(Date.now() + expireSeconds * 1000);
    const maxContentLength = this.config.maxContentLength ?? 100 * 1024 * 1024;
    const policy: UploadPolicy = {
      expiration: expirationDate.toISOString(),
      conditions: [
        { bucket: this.config.bucket },
        ['starts-with', '$key', `${prefix}/`],
        ['content-length-range', 0, maxContentLength],
      ],
    };
    const policyBase64 = Buffer.from(JSON.stringify(policy)).toString('base64');
    return { policy, policyBase64 };
  }

  /**
   * 用主账号 AccessKeySecret 对 Base64 Policy 计算 HMAC-SHA1 签名
   * 这是阿里云 OSS PostObject 表单上传的标准签名方式
   */
  private signPolicy(policyBase64: string): string {
    const hmac = crypto.createHmac('sha1', this.config.accessKeySecret);
    hmac.update(policyBase64);
    return hmac.digest('base64');
  }

  /**
   * 懒加载 STS SDK 客户端
   * Mock 模式下不会调用此方法
   */
  private async ensureSTSClient(): Promise<any> {
    if (this.stsClient) return this.stsClient;
    try {
      const StsMod: any = await import('@alicloud/sts20150401');
      const OpenApiMod: any = await import('@alicloud/openapi-client');
      const StsClient = StsMod.default;
      const Config = OpenApiMod.Config;
      const config = new Config({
        accessKeyId: this.config.accessKeyId,
        accessKeySecret: this.config.accessKeySecret,
        endpoint: this.getSTSEndpoint(),
        type: 'access_key',
      });
      this.stsClient = new StsClient(config);
      return this.stsClient;
    } catch (err) {
      throw new Error(
        `加载 @alicloud/sts20150401 失败：${(err as Error).message}。请安装依赖或在 Mock 模式下使用。`,
      );
    }
  }

  /**
   * 推导 STS 服务 Endpoint
   * region 形如 oss-cn-hangzhou → sts endpoint 为 sts.cn-hangzhou.aliyuncs.com
   */
  private getSTSEndpoint(): string {
    const region = this.config.region ?? 'oss-cn-hangzhou';
    const stsRegion = region.replace(/^oss-/, '');
    return `sts.${stsRegion}.aliyuncs.com`;
  }

  /**
   * 拼接 Bucket 访问域名
   * 例如 https://reelclone-assets.oss-cn-hangzhou.aliyuncs.com
   */
  private getBucketHost(): string {
    if (this.config.endpoint) {
      const ep = this.config.endpoint.replace(/^https?:\/\//, '');
      return `https://${this.config.bucket}.${ep}`;
    }
    return `https://${this.config.bucket}.${this.config.region}.aliyuncs.com`;
  }

  /**
   * Mock 模式下的 STSToken
   * 使用可识别的占位值，方便调试时识别
   */
  private mockAssumeRole(
    userId: string,
    resourcePrefix: string,
    expireSeconds: number,
  ): STSToken {
    const expiration = new Date(Date.now() + expireSeconds * 1000).toISOString();
    this.logger.debug(
      `[Mock] assumeRole userId=${userId} prefix=${resourcePrefix} expires=${expireSeconds}s`,
    );
    return {
      accessKeyId: `mock-sts-access-key-id-for-${userId}`,
      accessKeySecret: `mock-sts-access-key-secret`,
      securityToken: `mock-security-token-${Date.now()}`,
      expiration,
      bucket: this.config.bucket,
      region: this.config.region,
      host: this.getBucketHost(),
    };
  }
}
