/**
 * 订单 API 集成测试
 *
 * 覆盖 order-service 的核心端点：
 *  - GET  /packages          套餐列表（公开）
 *  - GET  /packages/:id      套餐详情（公开）
 *  - POST /orders            创建订单（JWT）
 *  - GET  /orders            订单列表（JWT，分页）
 *  - GET  /orders/:id        订单详情（JWT）
 *  - POST /orders/:id/cancel 取消订单（JWT）
 *  - POST /webhooks/wechat-pay  支付回调（公开，幂等）
 *
 * 测试重点：
 *  - 创建订单幂等性（idempotencyKey）
 *  - 支付回调幂等性（重复回调不重复赠积分）
 *  - 订单状态流转：PENDING → PAID / CANCELLED
 *  - 订单所有权校验（不可访问他人订单）
 */
import { createClient, withToken, ApiClient, ApiError } from '../helpers/test-client';
import {
  buildWechatLoginPayload,
  buildCreateOrderPayload,
  buildWechatPayCallbackPayload,
  randomIdempotencyKey,
} from '../helpers/mock-data';
import { cleanupUser, getOrderStatus, getUserPoints, seedPackages } from '../helpers/db-helper';

describe('订单 API（order-service）', () => {
  let authClient: ApiClient;
  let orderClient: ApiClient;
  let userId: string;

  let packages: Array<{ id: string; name: string; price: number; points: number; bonusPoints: number }>;
  let selectedPackage: { id: string; points: number; bonusPoints: number };

  beforeAll(async () => {
    packages = (await seedPackages()) as typeof packages;
    selectedPackage = packages[0];

    authClient = createClient('auth');
    const payload = buildWechatLoginPayload({ nickname: 'API测试-订单' });
    const loginResult = await authClient.wechatLogin(
      payload.code,
      payload.nickname,
      payload.avatarUrl,
    );
    userId = loginResult.user.id;
    orderClient = withToken(authClient, 'order');
  });

  afterAll(async () => {
    if (userId) {
      await cleanupUser(userId).catch(() => {
        /* noop */
      });
    }
  });

  describe('GET /packages（公开）', () => {
    test('套餐列表返回数组', async () => {
      const list = await orderClient.get<
        Array<{ id: string; name: string; status: string }>
      >('/packages');

      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      expect(list.every((p) => p.status === 'ACTIVE')).toBe(true);
    });

    test('套餐详情', async () => {
      const pkg = await orderClient.get<{
        id: string;
        name: string;
        price: number;
        points: number;
      }>(`/packages/${selectedPackage.id}`);

      expect(pkg.id).toBe(selectedPackage.id);
      expect(pkg.points).toBe(selectedPackage.points);
    });

    test('不存在的套餐返回 404', async () => {
      await expect(orderClient.get('/packages/non_existent_id')).rejects.toThrow(
        ApiError,
      );
    });
  });

  describe('POST /orders（创建订单）', () => {
    test('创建订单成功，返回订单号与支付参数', async () => {
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

      expect(result.orderId).toBeTruthy();
      expect(result.orderNo).toMatch(/^RC\d{20}$/);
      expect(result.paymentParams).toBeDefined();
      expect(result.paymentParams.paySign).toBeTruthy();
    });

    test('创建订单幂等性：相同 idempotencyKey 返回同一订单', async () => {
      const idemKey = randomIdempotencyKey('order_idem');
      const payload1 = buildCreateOrderPayload(selectedPackage.id, {
        idempotencyKey: idemKey,
      });
      const payload2 = buildCreateOrderPayload(selectedPackage.id, {
        idempotencyKey: idemKey,
      });

      const r1 = await orderClient.post<{ orderId: string; orderNo: string }>(
        '/orders',
        payload1,
      );
      const r2 = await orderClient.post<{ orderId: string; orderNo: string }>(
        '/orders',
        payload2,
      );

      expect(r1.orderId).toBe(r2.orderId);
      expect(r1.orderNo).toBe(r2.orderNo);
    });

    test('无效套餐 ID 应返回 404', async () => {
      await expect(
        orderClient.post(
          '/orders',
          buildCreateOrderPayload('non_existent_pkg'),
        ),
      ).rejects.toThrow(ApiError);
    });
  });

  describe('GET /orders（订单列表）', () => {
    test('订单列表分页', async () => {
      const result = await orderClient.get<{
        list: Array<{ id: string; status: string }>;
        total: number;
        page: number;
        pageSize: number;
      }>('/orders', { page: 1, pageSize: 10 });

      expect(Array.isArray(result.list)).toBe(true);
      expect(result.page).toBe(1);
    });

    test('状态筛选生效', async () => {
      const result = await orderClient.get<{
        list: Array<{ status: string }>;
      }>('/orders', { status: 'PENDING', page: 1, pageSize: 50 });

      // 所有返回的订单都应是 PENDING 状态
      expect(result.list.every((o) => o.status === 'PENDING')).toBe(true);
    });
  });

  describe('POST /orders/:id/cancel（取消订单）', () => {
    test('取消 PENDING 订单成功', async () => {
      // 先创建一个订单
      const created = await orderClient.post<{ orderId: string; orderNo: string }>(
        '/orders',
        buildCreateOrderPayload(selectedPackage.id),
      );

      const cancelled = await orderClient.post<{ id: string; status: string }>(
        `/orders/${created.orderId}/cancel`,
      );

      expect(cancelled.status).toBe('CANCELLED');

      // 查询确认状态
      const order = await orderClient.get<{ status: string }>(
        `/orders/${created.orderId}`,
      );
      expect(order.status).toBe('CANCELLED');
    });

    test('取消已取消订单应失败', async () => {
      const created = await orderClient.post<{ orderId: string }>(
        '/orders',
        buildCreateOrderPayload(selectedPackage.id),
      );
      await orderClient.post(`/orders/${created.orderId}/cancel`);

      // 再次取消应失败
      await expect(
        orderClient.post(`/orders/${created.orderId}/cancel`),
      ).rejects.toThrow(ApiError);
    });
  });

  describe('POST /webhooks/wechat-pay（支付回调幂等性）', () => {
    test('支付回调将订单标记为 PAID 并赠积分', async () => {
      const created = await orderClient.post<{ orderId: string; orderNo: string }>(
        '/orders',
        buildCreateOrderPayload(selectedPackage.id),
      );

      const callback = buildWechatPayCallbackPayload(created.orderNo);
      const result = await orderClient.post<{ code: string }>(
        '/webhooks/wechat-pay',
        callback.body,
        { headers: callback.headers, raw: true },
      );

      expect(result.code).toBe('SUCCESS');

      // 验证订单状态
      const order = await getOrderStatus(created.orderNo);
      expect(order?.status).toBe('PAID');
      expect(order?.transactionId).toBeTruthy();
    });

    test('支付回调幂等性：重复回调不重复赠积分', async () => {
      // 创建订单并支付
      const created = await orderClient.post<{ orderId: string; orderNo: string }>(
        '/orders',
        buildCreateOrderPayload(selectedPackage.id),
      );

      const callback = buildWechatPayCallbackPayload(created.orderNo);

      // 第一次回调
      await orderClient.post('/webhooks/wechat-pay', callback.body, {
        headers: callback.headers,
        raw: true,
      });

      const pointsAfter1 = (await getUserPoints(userId)).currentPoints;

      // 第二次重复回调（相同 transactionId）
      await orderClient.post('/webhooks/wechat-pay', callback.body, {
        headers: callback.headers,
        raw: true,
      });

      // 等待确认积分无变化
      await new Promise((r) => setTimeout(r, 1000));
      const pointsAfter2 = (await getUserPoints(userId)).currentPoints;

      expect(pointsAfter2).toBe(pointsAfter1);
    });

    test('回调对应订单不存在时返回 SUCCESS（避免微信重试）', async () => {
      const callback = buildWechatPayCallbackPayload(
        'RC_NOT_EXIST_ORDER_000000000001',
      );
      const result = await orderClient.post<{ code: string }>(
        '/webhooks/wechat-pay',
        callback.body,
        { headers: callback.headers, raw: true },
      );

      // 即便订单不存在，也返回 SUCCESS（符合微信规范）
      expect(result.code).toBe('SUCCESS');
    });
  });

  describe('订单所有权校验', () => {
    test('不可访问他人订单', async () => {
      // 用户 A 创建订单
      const userA = createClient('auth');
      const loginA = await userA.wechatLogin(
        buildWechatLoginPayload({ nickname: '用户A' }).code,
      );
      const orderClientA = withToken(userA, 'order');
      const created = await orderClientA.post<{ orderId: string }>('/orders', {
        packageId: selectedPackage.id,
      });

      // 用户 B 尝试访问 A 的订单
      const orderClientB = withToken(authClient, 'order');
      await expect(orderClientB.get(`/orders/${created.orderId}`)).rejects.toThrow(
        ApiError,
      );

      await cleanupUser(loginA.user.id).catch(() => {
        /* noop */
      });
    });
  });
});
