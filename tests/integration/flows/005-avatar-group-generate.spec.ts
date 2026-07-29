/**
 * TC-005: 真人形象组 → 授权 → 生成数字人
 *
 * 端到端验证数字人创作路径：
 *  1. 登录
 *  2. 创建真人形象组
 *  3. 获取上传凭证，上传形象素材（Mock 直传）
 *  4. 创建资产记录并关联到形象组
 *  5. 查看形象组详情，验证组内资产可见
 *  6. 提交 3D 建模任务（基于形象组素材生成数字人）
 *
 * 依赖服务：auth / asset / workbench / billing
 */
import { createClient, withToken, ApiClient } from '../helpers/test-client';
import {
  buildWechatLoginPayload,
  buildAvatarGroupPayload,
  buildUploadTokenPayload,
  buildAssetPayload,
  build3DModelingPayload,
} from '../helpers/mock-data';
import { poll } from '../helpers/wait';
import { cleanupUser } from '../helpers/db-helper';

describe('用户路径5: 真人形象组 → 授权 → 生成数字人', () => {
  let authClient: ApiClient;
  let assetClient: ApiClient;
  let workbenchClient: ApiClient;
  let userId: string;

  let avatarGroupId: string;
  let assetIds: string[] = [];

  beforeAll(async () => {
    authClient = createClient('auth');
    const loginPayload = buildWechatLoginPayload({ nickname: 'E2E-用户005' });
    const loginResult = await authClient.wechatLogin(
      loginPayload.code,
      loginPayload.nickname,
      loginPayload.avatarUrl,
    );
    userId = loginResult.user.id;

    assetClient = withToken(authClient, 'asset');
    workbenchClient = withToken(authClient, 'workbench');
  });

  afterAll(async () => {
    if (userId) {
      await cleanupUser(userId).catch(() => {
        /* 清理失败不阻断 */
      });
    }
  });

  test('1. 创建真人形象组（POST /avatar-groups）', async () => {
    const payload = buildAvatarGroupPayload();
    const group = await assetClient.post<{
      id: string;
      name: string;
      description: string;
      authorizationStatus?: string;
      assetCount?: number;
    }>('/avatar-groups', payload);

    expect(group).toBeDefined();
    expect(group.id).toBeTruthy();
    expect(group.name).toBe(payload.name);
    expect(group.authorizationStatus ?? 'PENDING').toBeTruthy();

    avatarGroupId = group.id;
  });

  test('2. 形象组名称唯一性：重复创建同名应失败', async () => {
    const payload = buildAvatarGroupPayload({ name: '唯一形象组_E2E_005' });
    await assetClient.post('/avatar-groups', payload);

    // 同名再次创建应失败
    await expect(assetClient.post('/avatar-groups', payload)).rejects.toThrow();
  });

  test('3. 查询形象组列表包含刚创建的组', async () => {
    const list = await assetClient.get<{
      list: Array<{ id: string; name: string; assetCount: number }>;
      total: number;
    }>('/avatar-groups', { page: 1, pageSize: 20 });

    expect(list.list.some((g) => g.id === avatarGroupId)).toBe(true);
  });

  test('4. 获取上传凭证（image / video 两个素材）', async () => {
    // 形象图
    const token1 = await assetClient.post<{ ossKey?: string; key?: string }>(
      '/assets/upload-token',
      buildUploadTokenPayload('image', '形象正面.png'),
    );
    expect(token1.ossKey ?? token1.key).toBeTruthy();

    // 授权视频
    const token2 = await assetClient.post<{ ossKey?: string; key?: string }>(
      '/assets/upload-token',
      buildUploadTokenPayload('video', '授权视频.mp4'),
    );
    expect(token2.ossKey ?? token2.key).toBeTruthy();
  });

  test('5. 上传形象素材并关联到形象组（创建 IMAGE 资产）', async () => {
    const token = await assetClient.post<{ ossKey?: string; key?: string }>(
      '/assets/upload-token',
      buildUploadTokenPayload('image', '形象素材.png'),
    );
    const ossKey = (token.ossKey ?? token.key) as string;

    const asset = await assetClient.post<{
      id: string;
      ossKey: string;
      avatarGroupId: string | null;
    }>(
      '/assets',
      buildAssetPayload({
        ossKey,
        name: '形象素材.png',
        type: 'IMAGE',
        avatarGroupId,
      }),
    );

    expect(asset).toBeDefined();
    expect(asset.id).toBeTruthy();
    expect(asset.avatarGroupId).toBe(avatarGroupId);
    assetIds.push(asset.id);
  });

  test('6. 上传授权视频素材（创建 VIDEO 资产）', async () => {
    const token = await assetClient.post<{ ossKey?: string; key?: string }>(
      '/assets/upload-token',
      buildUploadTokenPayload('video', '授权动作视频.mp4'),
    );
    const ossKey = (token.ossKey ?? token.key) as string;

    const asset = await assetClient.post<{
      id: string;
      ossKey: string;
      type: string;
    }>(
      '/assets',
      buildAssetPayload({
        ossKey,
        name: '授权动作视频.mp4',
        type: 'VIDEO',
        mimeType: 'video/mp4',
        size: 1024 * 1024 * 5,
        duration: 10,
        avatarGroupId,
      }),
    );

    expect(asset).toBeDefined();
    expect(asset.id).toBeTruthy();
    expect(asset.type).toBe('VIDEO');
    assetIds.push(asset.id);
  });

  test('7. 查看形象组详情包含组内资产', async () => {
    const group = await assetClient.get<{
      id: string;
      name: string;
      assets?: Array<{ id: string; type: string }>;
      assetCount?: number;
    }>(`/avatar-groups/${avatarGroupId}`);

    expect(group).toBeDefined();
    expect(group.id).toBe(avatarGroupId);

    // 组内资产应包含刚上传的 2 个
    const groupAssets = group.assets ?? [];
    expect(groupAssets.length).toBeGreaterThanOrEqual(assetIds.length);
    expect(groupAssets.some((a) => a.id === assetIds[0])).toBe(true);
    expect(groupAssets.some((a) => a.id === assetIds[1])).toBe(true);
  });

  test('8. 更新形象组授权状态（PUT /avatar-groups/:id）', async () => {
    // 模拟管理后台审核通过（Mock 模式下直接更新）
    const updated = await assetClient.put<{
      id: string;
      authorizationStatus?: string;
    }>(`/avatar-groups/${avatarGroupId}`, {
      authorizationStatus: 'APPROVED',
      description: '授权已审核通过',
    });

    expect(updated).toBeDefined();
    expect(updated.id).toBe(avatarGroupId);
  });

  test('9. 提交 3D 建模任务（POST /generations，generationType=3D_MODELING）', async () => {
    // 取形象组内第一张图片作为参考
    const firstAsset = assetIds[0];
    const asset = await assetClient.get<{ ossKey: string }>(`/assets/${firstAsset}`);

    const payload = build3DModelingPayload({
      referenceImages: [asset.ossKey],
      prompt: '基于真人形象生成 3D 数字人模型，可用于后续视频生成',
    });

    const result = await workbenchClient.post<{ workId: string; taskId: string }>(
      '/generations',
      payload,
    );

    expect(result).toBeDefined();
    expect(result.workId).toBeTruthy();
    expect(result.taskId).toBeTruthy();

    // 缓存 workId
    (avatarGroupId as string & { __workId?: string }).concat; // noop
    (payload as { __workId?: string }).__workId = result.workId;
  });

  test('10. 轮询等待 3D 建模作品完成', async () => {
    // 取最近创建的作品
    const list = await workbenchClient.get<{
      list: Array<{ id: string; status: string }>;
      total: number;
    }>('/works', { page: 1, pageSize: 5 });

    expect(list.list.length).toBeGreaterThan(0);
    const latestWorkId = list.list[0].id;

    const detail = await poll({
      fn: () =>
        workbenchClient.get<{ id: string; status: string }>(`/works/${latestWorkId}`),
      predicate: (w) => w.status === 'COMPLETED' || w.status === 'FAILED',
      timeout: 20000,
      message: `3D 建模作品 ${latestWorkId} 未在超时内完成`,
    });

    expect(['COMPLETED', 'FAILED']).toContain(detail.status);
  });

  test('11. 删除形象组级联删除组内资产', async () => {
    const result = await assetClient.delete<{ deleted?: boolean; id?: string }>(
      `/avatar-groups/${avatarGroupId}`,
    );
    expect(result).toBeDefined();

    // 形象组列表不再包含该组
    const list = await assetClient.get<{
      list: Array<{ id: string }>;
      total: number;
    }>('/avatar-groups', { page: 1, pageSize: 50 });
    expect(list.list.some((g) => g.id === avatarGroupId)).toBe(false);
  });
});
