/**
 * OSS 服务
 * 封装阿里云 OSS 的上传 / 下载 / 删除 / 签名 URL / 元信息查询等基础操作
 *
 * 设计要点：
 * - 通过 NestJS @Injectable() 装饰，配合 OSSModule.forRoot 注入配置
 * - Mock 模式下不实例化 ali-oss 客户端，返回模拟数据，便于本地开发与小程序调试
 * - 所有方法均返回 Promise，统一异步语义
 */

import OSS from 'ali-oss';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { FileMetadata, OSSConfig, UploadResult } from './types';

/** OSS 配置注入 Token，配合 OSSModule.forRoot 使用 */
export const OSS_CONFIG_TOKEN = Symbol('OSS_CONFIG_TOKEN');

/**
 * OSS 服务
 */
@Injectable()
export class OSSService {
  private readonly logger = new Logger(OSSService.name);
  /** ali-oss 客户端实例，Mock 模式下为 null */
  private readonly client: OSS | null;
  /** 原始配置引用 */
  private readonly config: OSSConfig;

  constructor(@Inject(OSS_CONFIG_TOKEN) config: OSSConfig) {
    this.config = config;
    if (config.mock) {
      this.client = null;
      this.logger.warn(
        'OSSService 处于 Mock 模式：将返回模拟数据，不会真正访问 OSS',
      );
    } else {
      this.client = new OSS({
        region: config.region,
        accessKeyId: config.accessKeyId,
        accessKeySecret: config.accessKeySecret,
        bucket: config.bucket,
        endpoint: config.endpoint,
        secure: true,
      });
    }
  }

  /** 是否处于 Mock 模式 */
  isMock(): boolean {
    return this.config.mock === true;
  }

  /**
   * 上传本地文件到 OSS
   * @param localPath 本地文件绝对路径
   * @param key       目标对象 Key
   * @returns 上传结果（包含可访问 URL 与 Key）
   */
  async upload(localPath: string, key: string): Promise<UploadResult> {
    if (this.isMock() || !this.client) {
      return this.mockUpload(key);
    }
    const result = await this.client.put(key, localPath);
    return {
      url: result.url,
      key: result.name,
    };
  }

  /**
   * 下载 OSS 对象到本地路径
   * @param key       对象 Key
   * @param localPath 本地保存路径
   * @returns 实际写入的本地路径
   */
  async download(key: string, localPath: string): Promise<string> {
    if (this.isMock() || !this.client) {
      this.logger.warn(`[Mock] download ${key} → ${localPath}（未真正下载）`);
      return localPath;
    }
    await this.client.get(key, localPath);
    return localPath;
  }

  /**
   * 删除单个对象
   * @param key 对象 Key
   * @returns 是否删除成功
   */
  async delete(key: string): Promise<boolean> {
    if (this.isMock() || !this.client) {
      this.logger.warn(`[Mock] delete ${key}（未真正删除）`);
      return true;
    }
    try {
      await this.client.delete(key);
      return true;
    } catch (err) {
      this.logger.error(`删除对象失败 key=${key}`, (err as Error).stack);
      return false;
    }
  }

  /**
   * 批量删除对象（最多 1000 个）
   * @param keys 对象 Key 数组
   * @returns 是否全部删除成功
   */
  async deleteMany(keys: string[]): Promise<boolean> {
    if (keys.length === 0) return true;
    if (keys.length > 1000) {
      throw new Error('单次批量删除对象数不能超过 1000');
    }
    if (this.isMock() || !this.client) {
      this.logger.warn(`[Mock] deleteMany ${keys.length} 个对象（未真正删除）`);
      return true;
    }
    try {
      await this.client.deleteMulti(keys);
      return true;
    } catch (err) {
      this.logger.error(
        `批量删除对象失败 count=${keys.length}`,
        (err as Error).stack,
      );
      return false;
    }
  }

  /**
   * 检查对象是否存在
   * 通过 HEAD 请求判定，404 视为不存在
   * @param key 对象 Key
   */
  async exists(key: string): Promise<boolean> {
    if (this.isMock() || !this.client) {
      return false;
    }
    try {
      await this.client.head(key);
      return true;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'NoSuchKey' || code === '404') {
        return false;
      }
      this.logger.error(
        `检查对象存在性失败 key=${key}`,
        (err as Error).stack,
      );
      return false;
    }
  }

  /**
   * 生成签名 URL（默认 15 分钟有效）
   * 用于临时授权访问私有 Bucket 中的对象
   *
   * @param key           对象 Key
   * @param expireSeconds 过期秒数，默认 900（15 分钟）
   */
  async getSignedUrl(key: string, expireSeconds: number = 900): Promise<string> {
    if (this.isMock() || !this.client) {
      return `https://${this.config.bucket}.${this.config.region}.aliyuncs.com/${key}?mock-signature&expires=${expireSeconds}`;
    }
    return this.client.signatureUrl(key, {
      expires: expireSeconds,
    });
  }

  /**
   * 获取对象元信息
   * @param key 对象 Key
   */
  async getMetadata(key: string): Promise<FileMetadata> {
    if (this.isMock() || !this.client) {
      return {
        size: 0,
        mimeType: 'application/octet-stream',
        etag: 'mock-etag',
        lastModified: new Date(),
      };
    }
    const head = await this.client.head(key);
    const headers = head.res.headers as Record<string, string>;
    const size = Number(headers['content-length'] ?? '0');
    const mimeType = headers['content-type'] ?? 'application/octet-stream';
    const etag = (headers['etag'] ?? '').replace(/"/g, '');
    const lastModified = headers['last-modified']
      ? new Date(headers['last-modified'])
      : new Date();
    return { size, mimeType, etag, lastModified };
  }

  /**
   * 构造可访问 URL（默认公有读 Bucket 直接拼接；私有 Bucket 应使用 getSignedUrl）
   */
  buildPublicUrl(key: string): string {
    const host = this.config.endpoint
      ? this.config.endpoint.replace(/^https?:\/\//, `${this.config.bucket}.`)
      : `${this.config.bucket}.${this.config.region}.aliyuncs.com`;
    return `https://${host}/${key}`;
  }

  /**
   * Mock 模式下的上传返回
   */
  private mockUpload(key: string): UploadResult {
    this.logger.warn(`[Mock] upload → ${key}（未真正上传）`);
    return {
      url: this.buildPublicUrl(key),
      key,
    };
  }
}
