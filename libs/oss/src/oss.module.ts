/**
 * OSS 模块
 * 提供 forRoot 全局配置 + forFeature 注入 OSSService / STSService
 *
 * 用法示例：
 *
 *   // app.module.ts
 *   import { OSSModule } from '@reelclone/oss';
 *
 *   @Module({
 *     imports: [
 *       ConfigModule.forRoot({ isGlobal: true }),
 *       OSSModule.forRoot(), // 从环境变量读取
 *     ],
 *   })
 *   export class AppModule {}
 *
 *   // feature.module.ts
 *   @Module({
 *     imports: [OSSModule.forFeature()],
 *   })
 *   export class FeatureModule {}
 *
 * 也可显式传入配置：
 *
 *   OSSModule.forRoot({
 *     region: 'oss-cn-hangzhou',
 *     accessKeyId: '...',
 *     accessKeySecret: '...',
 *     bucket: 'reelclone-assets',
 *   })
 */

import { DynamicModule, Module, Provider } from '@nestjs/common';
import { OSS_CONFIG_TOKEN, OSSService } from './oss.service';
import { STSService } from './sts.service';
import { OSSConfig } from './types';
import { loadOSSConfig } from './config/oss.config';

@Module({})
export class OSSModule {
  /**
   * 全局注册 OSS 模块
   * 不传 options 时从环境变量读取配置（自动启用 Mock 模式判定）
   *
   * @param options 显式配置；不传则使用 loadOSSConfig(process.env)
   */
  static forRoot(options?: Partial<OSSConfig>): DynamicModule {
    const config: OSSConfig = options
      ? this.mergeWithEnv(options)
      : loadOSSConfig(process.env);

    const configProvider: Provider = {
      provide: OSS_CONFIG_TOKEN,
      useValue: config,
    };

    return {
      module: OSSModule,
      global: true,
      providers: [configProvider, OSSService, STSService],
      exports: [OSSService, STSService],
    };
  }

  /**
   * 在特性模块中导入 OSSService / STSService
   *
   * 用法一（推荐）：全局注册一次，所有模块直接注入
   *   imports: [OSSModule.forRoot()]
   *
   * 用法二：模块级独立配置（不依赖 forRoot，从环境变量读取或显式传入）
   *   imports: [OSSModule.forFeature({ bucket: 'other-bucket' })]
   *
   * @param options 可选配置；不传则从环境变量读取
   */
  static forFeature(options?: Partial<OSSConfig>): DynamicModule {
    const config: OSSConfig = options
      ? this.mergeWithEnv(options)
      : loadOSSConfig(process.env);
    const configProvider: Provider = {
      provide: OSS_CONFIG_TOKEN,
      useValue: config,
    };
    return {
      module: OSSModule,
      providers: [configProvider, OSSService, STSService],
      exports: [OSSService, STSService],
    };
  }

  /**
   * 将显式 options 与环境变量合并
   * 优先使用 options 字段，未提供的字段回退到环境变量
   */
  private static mergeWithEnv(options: Partial<OSSConfig>): OSSConfig {
    const envConfig = loadOSSConfig(process.env);
    return {
      ...envConfig,
      ...options,
      // 显式提供 options 时不自动进入 Mock 模式（除非用户明确指定）
      mock: options.mock ?? envConfig.mock,
    } as OSSConfig;
  }
}
