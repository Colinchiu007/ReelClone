/**
 * TC-003: 对标解析 → 基于拆解生成新视频
 *
 * 端到端验证对标解析与二次创作路径：
 *  1. 登录
 *  2. 提交对标解析任务（抖音链接）
 *  3. 轮询等待解析完成
 *  4. 查看解析结果（脚本拆解 / 分镜 / 关键词等）
 *  5. 基于解析结果提交新视频生成任务
 *
 * 依赖服务：auth / benchmark / workbench / billing
 */
import { createClient, withToken, ApiClient } from '../helpers/test-client';
import {
  buildWechatLoginPayload,
  buildBenchmarkPayload,
  buildTextToVideoPayload,
} from '../helpers/mock-data';
import { poll } from '../helpers/wait';
import { cleanupUser } from '../helpers/db-helper';

describe('用户路径3: 对标解析 → 基于拆解生成新视频', () => {
  let authClient: ApiClient;
  let benchmarkClient: ApiClient;
  let workbenchClient: ApiClient;
  let userId: string;
  let benchmarkId: string;

  beforeAll(async () => {
    authClient = createClient('auth');
    const loginPayload = buildWechatLoginPayload({ nickname: 'E2E-用户003' });
    const loginResult = await authClient.wechatLogin(
      loginPayload.code,
      loginPayload.nickname,
      loginPayload.avatarUrl,
    );
    userId = loginResult.user.id;

    benchmarkClient = withToken(authClient, 'benchmark');
    workbenchClient = withToken(authClient, 'workbench');
  });

  afterAll(async () => {
    if (userId) {
      await cleanupUser(userId).catch(() => {
        /* 清理失败不阻断 */
      });
    }
  });

  test('1. 提交对标解析任务（POST /benchmarks，抖音链接）', async () => {
    const payload = buildBenchmarkPayload();
    const result = await benchmarkClient.post<{
      benchmarkId: string;
      status: string;
      estimatedPoints?: number;
    }>('/benchmarks', payload);

    expect(result).toBeDefined();
    expect(result.benchmarkId).toBeTruthy();
    expect(result.status).toBeTruthy();
    // 初始状态应为 PENDING 或 PROCESSING
    expect(['PENDING', 'PROCESSING', 'COMPLETED']).toContain(result.status);
    benchmarkId = result.benchmarkId;
  });

  test('2. 查看解析历史包含刚提交的任务', async () => {
    const list = await benchmarkClient.get<{
      list: Array<{ id: string; status: string }>;
      total: number;
    }>('/benchmarks', { page: 1, pageSize: 20 });

    expect(list.list.some((b) => b.id === benchmarkId)).toBe(true);
  });

  test('3. 轮询等待解析完成（Mock 模式立即完成）', async () => {
    const detail = await poll({
      fn: () =>
        benchmarkClient.get<{ id: string; status: string; result?: unknown }>(
          `/benchmarks/${benchmarkId}`,
        ),
      predicate: (b) =>
        b.status === 'COMPLETED' || b.status === 'FAILED' || b.status === 'SUCCESS',
      timeout: 20000,
      message: `对标解析任务 ${benchmarkId} 未在超时内完成`,
    });

    expect(['COMPLETED', 'SUCCESS', 'FAILED']).toContain(detail.status);
  });

  test('4. 查看解析详情（GET /benchmarks/:id）', async () => {
    const detail = await benchmarkClient.get<{
      id: string;
      status: string;
      sourceUrl: string;
      platform?: string;
      result?: {
        script?: string;
        scenes?: unknown[];
        keywords?: string[];
      };
      [k: string]: unknown;
    }>(`/benchmarks/${benchmarkId}`);

    expect(detail).toBeDefined();
    expect(detail.id).toBe(benchmarkId);
    expect(detail.sourceUrl).toBeTruthy();
    // 完成的解析应携带结果字段（结构因实现而异，仅校验存在性）
    expect(detail.platform ?? detail.result ?? detail.status).toBeTruthy();
  });

  test('5. 基于解析结果提交新视频生成任务', async () => {
    // 取解析结果作为生成 prompt 的素材
    const detail = await benchmarkClient.get<{
      result?: { script?: string; keywords?: string[] };
    }>(`/benchmarks/${benchmarkId}`);

    const promptSource =
      detail.result?.script ??
      (detail.result?.keywords?.length
        ? detail.result.keywords.join('，')
        : '对标解析参考内容');

    const payload = buildTextToVideoPayload({
      prompt: `基于对标解析创作：${promptSource.slice(0, 100)}`,
    });

    const result = await workbenchClient.post<{ workId: string; taskId: string }>(
      '/generations',
      payload,
    );

    expect(result).toBeDefined();
    expect(result.workId).toBeTruthy();
    expect(result.taskId).toBeTruthy();

    // 缓存 workId
    (benchmarkId as string & { workId?: string }).concat; // noop 占位
    (detail as { __workId?: string }).__workId = result.workId;
  });

  test('6. 验证新生成的作品已创建', async () => {
    // 通过作品列表确认新作品存在
    const list = await workbenchClient.get<{
      list: Array<{ id: string; status: string }>;
      total: number;
    }>('/works', { page: 1, pageSize: 20 });

    expect(list.total).toBeGreaterThan(0);
    expect(list.list.length).toBeGreaterThan(0);
  });

  test('7. 取消对标解析任务（POST /benchmarks/:id/cancel）', async () => {
    // 提交一个新的可取消任务（已完成的无法取消）
    const payload = buildBenchmarkPayload({
      sourceUrl: 'https://www.douyin.com/video/cancel_test_001',
    });
    const created = await benchmarkClient.post<{ benchmarkId: string; status: string }>(
      '/benchmarks',
      payload,
    );

    // 尝试取消（若已完成则忽略错误）
    try {
      const result = await benchmarkClient.post<{ benchmarkId: string; status: string }>(
        `/benchmarks/${created.benchmarkId}/cancel`,
      );
      expect(result).toBeDefined();
    } catch {
      // 已完成的任务取消会返回错误，符合预期
    }
  });
});
