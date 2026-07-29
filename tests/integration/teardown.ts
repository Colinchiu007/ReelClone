/**
 * 测试环境清理（globalTeardown）
 *
 * 在所有测试结束后执行一次，职责：
 *  1. 清理测试产生的残留数据（保留 package 种子，便于下次运行）
 *  2. 输出测试摘要提示
 *
 * 不停止微服务进程（由外部编排管理），
 * 也不强制关闭数据库连接（DataSource 在 db-helper 中按需创建销毁）。
 */
import { cleanupAllTables } from './helpers/db-helper';

/** 是否跳过清理（调试时保留数据用于排查） */
const SKIP_TEARDOWN = process.env.E2E_SKIP_TEARDOWN === 'true';

/** 简易日志 */
function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`\n[teardown] ${message}`);
}

/**
 * 全局 teardown
 */
export default async function teardown(): Promise<void> {
  log('=== ReelClone E2E 测试环境清理 ===');

  if (SKIP_TEARDOWN) {
    log('⏭️  跳过清理（E2E_SKIP_TEARDOWN=true），保留数据用于排查');
    return;
  }

  try {
    await cleanupAllTables();
    log('✅ 测试数据已清理（保留 package 种子）');
  } catch (err) {
    // 清理失败不应导致测试报告异常，仅警告
    log(`⚠️  清理失败: ${(err as Error).message}`);
  }

  log('=== 清理完成 ===\n');
}

teardown().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[teardown] 清理过程出错（不影响测试结果）:', err.message);
});
