/**
 * @reelclone/oss 入口
 * 导出 OSS 服务、STS 服务、模块、类型、配置与 Key 生成工具
 */

// 服务与模块
export { OSSModule } from './oss.module';
export { OSSService, OSS_CONFIG_TOKEN } from './oss.service';
export { STSService } from './sts.service';

// 类型定义
export type {
  OSSConfig,
  STSToken,
  UploadPolicy,
  UploadToken,
  FileMetadata,
  UploadResult,
} from './types';

// 配置工厂
export {
  loadOSSConfig,
  ossConfigFactory,
  OSS_CONFIG_KEY,
} from './config/oss.config';

// Key 生成工具
export {
  generateAssetKey,
  generateWorkKey,
  generateThumbnailKey,
  generateBenchmarkKey,
  generateTemplateKey,
  generateTempKey,
} from './utils/key-generator.util';
export type { OSSObjectType } from './utils/key-generator.util';
