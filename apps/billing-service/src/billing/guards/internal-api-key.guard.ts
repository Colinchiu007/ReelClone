import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';
import { BusinessException, ErrorCode } from '@reelclone/common';
import { IS_INTERNAL_API_KEY } from './internal-api.decorator';

/** 最小化请求结构 */
interface MinimalRequest {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * 内部 API Key 鉴权守卫
 *
 * 仅对 @InternalApi() 装饰的路由生效：
 *  - 校验 `x-api-key` Header 与 INTERNAL_API_KEY 环境变量
 *  - 使用常量时间比较（timingSafeEqual）防范时序攻击
 *  - 不匹配则抛 UNAUTHORIZED
 * 非 @InternalApi() 路由直接放行（交给上层 JWT 守卫处理）。
 */
@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(InternalApiKeyGuard.name);
  private readonly expectedKey: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    this.expectedKey = this.configService.get<string>('INTERNAL_API_KEY') ?? '';
  }

  canActivate(context: ExecutionContext): boolean {
    const isInternal = this.reflector.getAllAndOverride<boolean>(
      IS_INTERNAL_API_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 非内部 API，直接放行
    if (!isInternal) {
      return true;
    }

    const request = context.switchToHttp().getRequest<MinimalRequest>();
    const providedKey = this.extractApiKey(request.headers);

    if (!this.expectedKey) {
      this.logger.error(
        'INTERNAL_API_KEY 环境变量未配置，内部 API 无法鉴权',
      );
      throw new BusinessException(
        ErrorCode.INTERNAL_ERROR,
        '内部 API 鉴权未配置',
        undefined,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!providedKey || !this.constantTimeCompare(providedKey, this.expectedKey)) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '内部 API Key 无效',
        undefined,
        HttpStatus.UNAUTHORIZED,
      );
    }

    return true;
  }

  /** 提取 x-api-key Header（大小写不敏感） */
  private extractApiKey(
    headers: Record<string, string | string[] | undefined>,
  ): string | undefined {
    const raw = headers['x-api-key'] ?? headers['X-Api-Key'];
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw.trim();
    }
    return undefined;
  }

  /**
   * 常量时间字符串比较
   *
   * 防范时序攻击：直接 `a === b` 比较会因首个不匹配字符提前返回，
   * 攻击者可通过测量响应时间逐字符爆破密钥。
   * 使用 crypto.timingSafeEqual 保证比较耗时与字符串内容无关。
   */
  private constantTimeCompare(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) {
      // 长度不同时也走完一次 timingSafeEqual 以保持耗时稳定
      crypto.timingSafeEqual(bBuf, bBuf);
      return false;
    }
    return crypto.timingSafeEqual(aBuf, bBuf);
  }
}
