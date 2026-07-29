import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from './snake-naming.strategy';

// ---------------- 实体导入 ----------------
import { User } from '../entities/user.entity';
import { Asset } from '../entities/asset.entity';
import { AvatarGroup } from '../entities/avatar-group.entity';
import { Work } from '../entities/work.entity';
import { GenerationTask } from '../entities/generation-task.entity';
import { Package } from '../entities/package.entity';
import { Order } from '../entities/order.entity';
import { UserPackage } from '../entities/user-package.entity';
import { SmsCode } from '../entities/sms-code.entity';
import { Notification } from '../entities/notification.entity';
import { PointTransaction } from '../entities/point-transaction.entity';
import { Template } from '../entities/template.entity';
import { Favorite } from '../entities/favorite.entity';
import { Benchmark } from '../entities/benchmark.entity';

/** 实体构造器类型（避免直接使用 Function 字面量） */
export type EntityConstructor = new (...args: unknown[]) => unknown;

/** 数据库连接名 */
export const DATABASE_CONNECTIONS = {
  MAIN: 'main',
  BILLING: 'billing',
  TEMPLATE: 'template',
  BENCHMARK: 'benchmark',
} as const;

export type DatabaseConnectionName =
  (typeof DATABASE_CONNECTIONS)[keyof typeof DATABASE_CONNECTIONS];

/** main 库实体清单 */
export const MAIN_ENTITIES: EntityConstructor[] = [
  User,
  Asset,
  AvatarGroup,
  Work,
  GenerationTask,
  Package,
  Order,
  UserPackage,
  SmsCode,
  Notification,
];

/** billing 库实体清单 */
export const BILLING_ENTITIES: EntityConstructor[] = [PointTransaction];

/** template 库实体清单 */
export const TEMPLATE_ENTITIES: EntityConstructor[] = [Template, Favorite];

/** benchmark 库实体清单 */
export const BENCHMARK_ENTITIES: EntityConstructor[] = [Benchmark];

/**
 * 构造指定数据库的连接配置
 * @param database 数据库名
 * @param entities 该连接注册的实体清单
 */
export function buildDataSourceOptions(
  database: string,
  entities: EntityConstructor[],
): DataSourceOptions {
  return {
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USER || 'reelclone',
    password: process.env.DATABASE_PASSWORD || 'reelclone_dev',
    database,
    entities,
    synchronize: false,
    namingStrategy: new SnakeNamingStrategy(),
    logging:
      process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  };
}

/**
 * 数据库配置模块
 *
 * 4 个独立数据库连接：
 * - main:      用户/资产/形象组/作品/任务/套餐/订单/用户套餐/短信/通知
 * - billing:   积分流水
 * - template:  模板/收藏
 * - benchmark: 对标解析
 *
 * 用法：
 *   DatabaseModule.forRoot()
 *   DatabaseModule.forFeature([User], 'main')
 */
@Module({})
export class DatabaseModule {
  /** 初始化全部 4 个数据库连接 */
  static forRoot(): DynamicModule {
    const connections: TypeOrmModuleOptions[] = [
      {
        name: DATABASE_CONNECTIONS.MAIN,
        ...buildDataSourceOptions('reelclone_main', MAIN_ENTITIES),
      },
      {
        name: DATABASE_CONNECTIONS.BILLING,
        ...buildDataSourceOptions('reelclone_billing', BILLING_ENTITIES),
      },
      {
        name: DATABASE_CONNECTIONS.TEMPLATE,
        ...buildDataSourceOptions('reelclone_template', TEMPLATE_ENTITIES),
      },
      {
        name: DATABASE_CONNECTIONS.BENCHMARK,
        ...buildDataSourceOptions('reelclone_benchmark', BENCHMARK_ENTITIES),
      },
    ];

    return {
      module: DatabaseModule,
      imports: connections.map((opts) => TypeOrmModule.forRoot(opts)),
      exports: [TypeOrmModule],
    };
  }

  /**
   * 在子模块中注入指定连接的实体仓储
   * @param entities 实体类数组
   * @param connection 连接名（main / billing / template / benchmark）
   */
  static forFeature(
    entities: EntityConstructor[],
    connection?: DatabaseConnectionName,
  ): DynamicModule {
    return TypeOrmModule.forFeature(entities, connection);
  }
}
