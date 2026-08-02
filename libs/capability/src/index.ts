/**
 * @reelclone/capability — 生成能力单一真相源
 *
 * 统一管理 Provider 路由、积分定价、参数校验和 UI 配置。
 * 后端和前端均可直接导入，无需 NestJS DI。
 */
export { GenerationType } from './generation-type';
export type {
  CapabilityConfig,
  PointsConfig,
  FixedPoints,
  MatrixPoints,
  UIConfig,
  ModelOption,
  ValidationConfig,
  ParamRule,
  TemporalWorkTypeName,
  WorkTypeName,
} from './capability.types';
export { CapabilityRegistry } from './capability.registry';
export { DEFAULT_CAPABILITIES } from './capability.default';
export { CapabilityModule, CAPABILITY_REGISTRY } from './capability.module';
