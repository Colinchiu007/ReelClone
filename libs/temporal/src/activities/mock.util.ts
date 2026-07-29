/**
 * 临时 Mock 模式判定工具
 *
 * 当 libs/ai 尚未实现真实 Provider 时，Activity 通过此工具切换 Mock 行为。
 * Mock 模式由环境变量 TEMPORAL_MOCK_MODE 控制（默认 development 环境开启）。
 */

/** 是否处于 Mock 模式 */
export function isMockMode(): boolean {
  const flag = process.env.TEMPORAL_MOCK_MODE
  if (flag !== undefined) {
    return flag === 'true' || flag === '1'
  }
  // 未显式设置时，development 默认开启 Mock
  return process.env.NODE_ENV !== 'production'
}

/** 生成确定性 Mock ID（基于输入前缀 + 时间戳） */
export function mockId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

/** 模拟异步耗时 */
export function mockDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
