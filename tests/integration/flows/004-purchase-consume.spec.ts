/**
 * TC-004: 购买套餐 → 积分到账 → 生成消费
 *
 * 端到端验证计费主路径：
 *  1. 登录（新用户，0 积分）
 *  2. 浏览套餐列表
 *  3. 创建订单
 *  4. 模拟支付回调（Mock 模式直接标记 PAID）
 *  5. 验证积分到账（user.currentPoints 增加）
 *  6. 提交生成任务，验证积分扣减
 *  7. 查询积分流水，验证 RECHARGE + CONSUME 记录
 *
 * 依赖服务：auth / order / billing / user / workbench
 *
 * 重点：验证支付回调幂等性（重复回调不重复赠积分）。
 */
import {
  createClient,
  withToken,
  ApiClient,
} from '../helpers/test-client';
import {
  buildWechatLoginPayload,
  buildCreateOrderPayload,
  buildWechatPayCallbackPayload,
  buildTextGenerationPayload,
  randomIdempotencyKey,
} from '../helpers/mock-data';
import { poll } from '../helpers/wait';
import {
  cleanupUser,
  getUserPoints,
  seedPackages,
} from '../helpers/db-helper';

describe('用户路径4: 购买套餐 → 积分到账 → 生成消费', () => {
  let authClient: ApiClient;
  let orderClient: ApiClient;
  let billingClient: ApiClient;
  let userClient: ApiClient;
  let workbenchClient: ApiClient;
  let userId: string;
  let initialPoints: number;

  let packages: Array<{ id: string; name: string; points: number; bonusPoints: number }>;
  let selectedPackage: { id: string; points: number; bonusPoints: number };
  let orderId: string;
  let orderNo: string;

  beforeAll(async () => {
    // 确保种子套餐存在（setup.ts 已种过，这里幂等再执行一次）
    packages = (await seedPackages()) as typeof packages;
    selectedPackage = packages[0];

    authClient = createClient('auth');
    const loginPayload = buildWechatLoginPayload({ nickname: 'E2E-用户004' });
    const loginResult = await authClient.wechatLogin(
      loginPayload.code,
      loginPayload.nickname,
      loginPayload.avatarUrl,
    );
    userId = loginResult.user.id;
    initialPoints = loginResult.user.currentPoints;

    orderClient = withToken(authClient, 'order');
    billingClient = withToken(authClient, 'billing');
    userClient = withToken(authClient, 'user');
    workbenchClient = withToken(authClient, 'workbench');
  });

  afterAll(async () => {
    if (userId) {
      await cleanupUser(userId).catch(() => {
        /* 清理失败不阻断 */
      });
    }
  });

  test('1. 浏览套餐列表（GET /packages，公开）', async () => {
    const list = await orderClient.get<
      Array<{ id: string; name: string; price: number; points: number }>
    >('/packages');

    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((p) => p.id === selectedPackage.id)).toBe(true);
  });

  test('2. 创建订单（POST /orders）', async () => {
    const payload = buildCreateOrderPayload(selectedPackage.id);
    const result = await orderClient.post<{
      orderId: string;
      orderNo: string;
      paymentParams: {
        timeStamp: string;
        nonceStr: string;
        package: string;
        signType: string;
        paySign: string;
      };
    }>('/orders', payload);

    expect(result).toBeDefined();
    expect(result.orderId).toBeTruthy();
    expect(result.orderNo).toMatch(/^RC/);
    expect(result.paymentParams).toBeDefined();
    expect(result.paymentParams.timeStamp).toBeTruthy();
    expect(result.paymentParams.paySign).toBeTruthy();

    orderId = result.orderId;
    orderNo = result.orderNo;
  });

  test('3. 创建订单幂等性：相同 idempotencyKey 返回同一订单', async () => {
    const idemKey = randomIdempotencyKey('order_idem');
    const payload1 = buildCreateOrderPayload(selectedPackage.id, {
      idempotencyKey: idemKey,
    });
    const payload2 = buildCreateOrderPayload(selectedPackage.id, {
      idempotencyKey: idemKey,
    });

    const result1 = await orderClient.post<{ orderId: string; orderNo: string }>(
      '/orders',
      payload1,
    );
    const result2 = await orderClient.post<{ orderId: string; orderNo: string }>(
      '/orders',
      payload2,
    );

    expect(result1.orderId).toBe(result2.orderId);
    expect(result1.orderNo).toBe(result2.orderNo);
  });

  test('4. 模拟支付回调（POST /webhooks/wechat-pay，Mock 模式直接 PAID）', async () => {
    const callbackPayload = buildWechatPayCallbackPayload(orderNo);

    // webhook 端点是公开的，无需 JWT；直接用 orderClient 的 raw 模式
    const result = await orderClient.post<{ code: string; message: string }>(
      '/webhooks/wechat-pay',
      callbackPayload.body,
      { headers: callbackPayload.headers, raw: true },
    );

    // 微信回调规范：返回 { code: 'SUCCESS' }
    expect(result).toBeDefined();
    expect(result.code).toBe('SUCCESS');
  });

  test('5. 验证积分到账（user.currentPoints 增加）', async () => {
    const expectedPoints = initialPoints + selectedPackage.points + selectedPackage.bonusPoints;

    // 积分赠送可能跨服务异步，轮询确认
    const points = await poll({
      fn: () => getUserPoints(userId),
      predicate: (p) => p.currentPoints === expectedPoints,
      timeout: 10000,
      message: `积分未到账（期望 ${expectedPoints}）`,
    });

    expect(points.currentPoints).toBe(expectedPoints);
    expect(points.totalPoints).toBe(expectedPoints);
  });

  test('6. 支付回调幂等性：重复回调不重复赠积分', async () => {
    const pointsBefore = (await getUserPoints(userId)).currentPoints;
    const expectedTotalPoints =
      initialPoints + selectedPackage.points + selectedPackage.bonusPoints;

    // 重复发送同一回调（相同 transactionId）
    const callbackPayload = buildWechatPayCallbackPayload(orderNo);
    await orderClient.post('/webhooks/wechat-pay', callbackPayload.body, {
      headers: callbackPayload.headers,
      raw: true,
    });

    // 等待一小段确认积分无变化
    await new Promise((r) => setTimeout(r, 1000));
    const pointsAfter = (await getUserPoints(userId)).currentPoints;

    expect(pointsAfter).toBe(pointsBefore);
    expect(pointsAfter).toBe(expectedTotalPoints);
  });

  test('7. 查询积分余额（GET /points/balance）', async () => {
    const balance = await billingClient.get<{
      currentPoints: number;
      frozenPoints: number;
      totalPoints: number;
    }>('/points/balance');

    const expected = initialPoints + selectedPackage.points + selectedPackage.bonusPoints;
    expect(balance.currentPoints).toBe(expected);
    expect(balance.totalPoints).toBe(expected);
    expect(typeof balance.frozenPoints).toBe('number');
  });

  test('8. 查询积分流水包含 RECHARGE / GRANT 记录', async () => {
    const transactions = await billingClient.get<{
      list: Array<{
        id: string;
        type: string;
        direction: string;
        amount: number;
      }>;
      total: number;
    }>('/points/transactions', { page: 1, pageSize: 50 });

    expect(transactions.total).toBeGreaterThan(0);
    // 应包含一笔充值 / 赠送类型的入账流水
    const incomeTx = transactions.list.find(
      (t) => t.direction === 'IN' || t.type === 'RECHARGE' || t.type === 'GRANT',
    );
    expect(incomeTx).toBeDefined();
  });

  test('9. 提交生成任务并验证积分扣减', async () => {
    const pointsBefore = (await getUserPoints(userId)).currentPoints;
    expect(pointsBefore).toBeGreaterThan(0);

    const payload = buildTextGenerationPayload();
    const result = await workbenchClient.post<{ workId: string; taskId: string }>(
      '/generations',
      payload,
    );
    expect(result.workId).toBeTruthy();

    // 提交后会冻结积分，轮询确认积分变化（冻结或扣减）
    await poll({
      fn: () => getUserPoints(userId),
      predicate: (p) => p.currentPoints !== pointsBefore,
      timeout: 10000,
      message: '提交生成后积分未变化',
    });

    const pointsAfter = (await getUserPoints(userId)).currentPoints;
    expect(pointsAfter).toBeLessThan(pointsBefore);
  });

  test('10. 查询积分流水包含消费 / 冻结记录', async () => {
    const transactions = await billingClient.get<{
      list: Array<{
        id: string;
        type: string;
        direction: string;
        amount: number;
      }>;
      total: number;
    }>('/points/transactions', { page: 1, pageSize: 50 });

    // 应包含一笔出账流水（FREEZE 或 CONSUME）
    const outcomeTx = transactions.list.find(
      (t) => t.direction === 'OUT' || t.type === 'FREEZE' || t.type === 'CONSUME',
    );
    expect(outcomeTx).toBeDefined();
  });

  test('11. 查询订单详情状态为 PAID', async () => {
    const order = await orderClient.get<{
      id: string;
      status: string;
      transactionId: string | null;
      paidAt: string | null;
    }>(`/orders/${orderId}`);

    expect(order.status).toBe('PAID');
    expect(order.transactionId).toBeTruthy();
    expect(order.paidAt).toBeTruthy();
  });
});
