// ============================================================
// 数据库迁移运行器
// 依次对 4 个数据库（main/billing/template/benchmark）执行待迁移
// 用法：npm run migration:run
// ============================================================
import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from './modules/snake-naming.strategy';
import { InitMain1700000000000 } from './migrations/main/0001_init_main';
import { InitBilling1700000000001 } from './migrations/billing/0001_init_billing';
import { InitTemplate1700000000002 } from './migrations/template/0001_init_template';
import { InitBenchmark1700000000003 } from './migrations/benchmark/0001_init_benchmark';

/** 构造运行迁移用的数据源配置（不需要实体元数据） */
function buildOptions(
  database: string,
  migrations: DataSourceOptions['migrations'],
): DataSourceOptions {
  return {
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USER || 'reelclone',
    password: process.env.DATABASE_PASSWORD || 'reelclone_dev',
    database,
    synchronize: false,
    namingStrategy: new SnakeNamingStrategy(),
    migrations,
    migrationsRun: false,
    logging: ['error', 'warn'],
  };
}

/** 各数据库与其迁移清单的映射 */
const dataSources: Array<{ name: string; ds: DataSource }> = [
  {
    name: 'main',
    ds: new DataSource(buildOptions('reelclone_main', [InitMain1700000000000])),
  },
  {
    name: 'billing',
    ds: new DataSource(buildOptions('reelclone_billing', [InitBilling1700000000001])),
  },
  {
    name: 'template',
    ds: new DataSource(buildOptions('reelclone_template', [InitTemplate1700000000002])),
  },
  {
    name: 'benchmark',
    ds: new DataSource(buildOptions('reelclone_benchmark', [InitBenchmark1700000000003])),
  },
];

async function main(): Promise<void> {
  console.info('🚀 开始执行数据库迁移...');

  for (const { name, ds } of dataSources) {
    console.info(`\n📦 [${name}] 初始化数据源...`);
    await ds.initialize();
    const hasPending = await ds.showMigrations();
    if (hasPending) {
      console.info(`📦 [${name}] 执行待迁移...`);
      await ds.runMigrations();
      console.info(`✅ [${name}] 迁移完成`);
    } else {
      console.info(`⏭️  [${name}] 无待执行迁移`);
    }
    await ds.destroy();
  }

  console.info('\n🎉 全部数据库迁移完成');
}

main().catch((err: unknown) => {
  console.error('❌ 迁移执行失败:', err);
  process.exit(1);
});
