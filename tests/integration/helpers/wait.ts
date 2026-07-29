/**
 * 异步等待 / 轮询工具
 *
 * 用于在 Mock 模式下轮询异步操作（Temporal 工作流、回调处理等）的完成。
 * Mock 模式下操作通常立即完成，但仍保留轮询以保证测试稳定性。
 */

/** 简单 sleep，返回 Promise */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 轮询参数 */
export interface PollOptions<T> {
  /** 断言函数：返回 true 表示条件满足，停止轮询 */
  fn: () => T | Promise<T>;
  /** 断言通过判断：默认 truthy */
  predicate?: (value: T) => boolean;
  /** 总超时时间（毫秒），默认 10000 */
  timeout?: number;
  /** 轮询间隔（毫秒），默认 200 */
  interval?: number;
  /** 失败时附加的描述，便于排查 */
  message?: string;
}

/**
 * 轮询直到断言通过或超时
 *
 * @example
 * await poll({
 *   fn: () => getWork(workId),
 *   predicate: (work) => work.status === 'COMPLETED',
 *   message: '等待作品完成',
 * });
 */
export async function poll<T>(opts: PollOptions<T>): Promise<T> {
  const {
    fn,
    predicate = (v: T) => Boolean(v),
    timeout = 10000,
    interval = 200,
    message = 'poll 超时',
  } = opts;

  const deadline = Date.now() + timeout;
  let lastError: unknown;
  let lastValue: T | undefined;

  while (Date.now() < deadline) {
    try {
      lastValue = await fn();
      if (predicate(lastValue)) {
        return lastValue;
      }
    } catch (err) {
      lastError = err;
    }
    await sleep(interval);
  }

  const detail = lastError
    ? `${message}（最后错误: ${(lastError as Error).message}）`
    : `${message}（最后值: ${JSON.stringify(lastValue)}）`;
  throw new Error(detail);
}

/**
 * 等待服务就绪：轮询 health 端点直到返回 200
 */
export async function waitForHealthy(
  healthUrl: string,
  timeout = 30000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const resp = await fetch(healthUrl);
      if (resp.ok) {
        return;
      }
    } catch {
      // 服务尚未启动，继续轮询
    }
    await sleep(500);
  }
  throw new Error(`服务在 ${timeout}ms 内未就绪: ${healthUrl}`);
}
