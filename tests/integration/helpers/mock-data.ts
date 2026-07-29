/**
 * 测试数据工厂
 *
 * 集中管理所有测试用例的 mock 数据，便于维护与复用。
 * 所有数据生成器均支持传入 override 进行字段定制。
 */

/** 生成随机字符串（用于保证测试隔离） */
export function randomString(prefix = 'test'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** 生成随机手机号（13/15/18 开头） */
export function randomMobile(): string {
  const prefixes = ['138', '139', '150', '188', '199'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = Math.floor(10000000 + Math.random() * 89999999).toString();
  return `${prefix}${suffix}`;
}

/** 生成唯一幂等键 */
export function randomIdempotencyKey(biz = 'test'): string {
  return `${biz}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 生成随机 OSS Key（模拟直传后返回的 key） */
export function randomOssKey(fileType: 'image' | 'video' | 'audio' = 'image'): string {
  const ext = fileType === 'image' ? 'png' : fileType === 'video' ? 'mp4' : 'mp3';
  return `${fileType}/test-user/${randomString('file')}.${ext}`;
}

// -------------------- 微信登录 --------------------

export interface MockWechatLoginPayload {
  code?: string;
  nickname?: string;
  avatarUrl?: string;
}

/** 构造微信登录请求体 */
export function buildWechatLoginPayload(
  override: MockWechatLoginPayload = {},
): Required<Pick<MockWechatLoginPayload, 'code'>> & MockWechatLoginPayload {
  return {
    code: randomString('wx_code'),
    nickname: `测试用户${Math.floor(Math.random() * 1000)}`,
    avatarUrl: 'https://example.com/avatar.png',
    ...override,
  };
}

// -------------------- 生成任务 --------------------

export interface MockGenerationPayload {
  generationType?: string;
  prompt?: string;
  model?: string;
  resolution?: string;
  aspectRatio?: string;
  duration?: number;
  referenceImages?: string[];
  firstFrame?: string;
  lastFrame?: string;
  idempotencyKey?: string;
}

/** 构造文本生成任务请求体 */
export function buildTextGenerationPayload(
  override: MockGenerationPayload = {},
): MockGenerationPayload {
  return {
    generationType: 'TEXT_GENERATE',
    prompt: '一只柴犬在草地上奔跑，阳光明媚',
    idempotencyKey: randomIdempotencyKey('gen'),
    ...override,
  };
}

/** 构造文生视频任务请求体 */
export function buildTextToVideoPayload(
  override: MockGenerationPayload = {},
): MockGenerationPayload {
  return {
    generationType: 'TEXT_TO_VIDEO',
    prompt: '城市夜景延时摄影，霓虹灯闪烁',
    resolution: '720p',
    aspectRatio: '9:16',
    duration: 5,
    idempotencyKey: randomIdempotencyKey('t2v'),
    ...override,
  };
}

/** 构造图生视频（首帧）任务请求体 */
export function buildImageToVideoPayload(
  firstFrame: string,
  override: MockGenerationPayload = {},
): MockGenerationPayload {
  return {
    generationType: 'IMAGE_TO_VIDEO_FIRST',
    prompt: '让画面中的人物缓缓转身',
    firstFrame,
    resolution: '720p',
    aspectRatio: '9:16',
    duration: 5,
    idempotencyKey: randomIdempotencyKey('i2v'),
    ...override,
  };
}

/** 构造 3D 建模任务请求体 */
export function build3DModelingPayload(
  override: MockGenerationPayload = {},
): MockGenerationPayload {
  return {
    generationType: '3D_MODELING',
    prompt: '基于真人形象生成 3D 数字人模型',
    referenceImages: [randomOssKey('image')],
    idempotencyKey: randomIdempotencyKey('3d'),
    ...override,
  };
}

// -------------------- 资产 --------------------

export interface MockAssetPayload {
  ossKey?: string;
  name?: string;
  type?: 'IMAGE' | 'VIDEO' | 'AUDIO';
  size?: number;
  mimeType?: string;
  duration?: number;
  thumbnailKey?: string;
  avatarGroupId?: string;
}

/** 构造创建资产记录请求体 */
export function buildAssetPayload(
  override: MockAssetPayload = {},
): MockAssetPayload {
  const fileType = override.type?.toLowerCase() ?? 'image';
  return {
    ossKey: randomOssKey(fileType as 'image' | 'video' | 'audio'),
    name: `测试${fileType}_${Date.now()}.png`,
    type: 'IMAGE',
    size: 1024 * 256,
    mimeType: 'image/png',
    ...override,
  };
}

/** 构造上传凭证请求体 */
export function buildUploadTokenPayload(
  fileType: 'image' | 'video' | 'audio' = 'image',
  fileName?: string,
): { fileType: string; fileName: string } {
  const ext = fileType === 'image' ? 'png' : fileType === 'video' ? 'mp4' : 'mp3';
  return {
    fileType,
    fileName: fileName ?? `测试文件_${Date.now()}.${ext}`,
  };
}

// -------------------- 真人形象组 --------------------

export interface MockAvatarGroupPayload {
  name?: string;
  description?: string;
  authorizationKey?: string;
}

/** 构造创建真人形象组请求体 */
export function buildAvatarGroupPayload(
  override: MockAvatarGroupPayload = {},
): MockAvatarGroupPayload {
  return {
    name: `形象组_${randomString('ag')}`,
    description: '集成测试自动创建的形象组',
    ...override,
  };
}

// -------------------- 对标解析 --------------------

export interface MockBenchmarkPayload {
  sourceUrl?: string;
  idempotencyKey?: string;
}

/** 构造对标解析请求体 */
export function buildBenchmarkPayload(
  override: MockBenchmarkPayload = {},
): MockBenchmarkPayload {
  return {
    sourceUrl: 'https://www.douyin.com/video/7234567890123456789',
    idempotencyKey: randomIdempotencyKey('bench'),
    ...override,
  };
}

// -------------------- 订单 / 支付 --------------------

export interface MockCreateOrderPayload {
  packageId?: string;
  idempotencyKey?: string;
}

/** 构造创建订单请求体 */
export function buildCreateOrderPayload(
  packageId: string,
  override: MockCreateOrderPayload = {},
): MockCreateOrderPayload {
  return {
    packageId,
    idempotencyKey: randomIdempotencyKey('order'),
    ...override,
  };
}

/**
 * 构造微信支付回调报文（Mock 模式）
 *
 * 真实回调为加密报文，Mock 模式下 WechatPayService 会跳过签名校验，
 * 直接解析 resource 字段。这里构造一个可直接被 Mock 处理的报文。
 */
export function buildWechatPayCallbackPayload(
  orderNo: string,
  transactionId?: string,
): {
  headers: Record<string, string>;
  body: unknown;
} {
  return {
    headers: {
      'wechatpay-serial': 'mock-serial',
      'wechatpay-timestamp': Math.floor(Date.now() / 1000).toString(),
      'wechatpay-nonce': randomString('nonce'),
      'wechatpay-signature': 'mock-signature',
    },
    body: {
      resource: {
        ciphertext: JSON.stringify({
          out_trade_no: orderNo,
          transaction_id: transactionId ?? randomString('tx'),
          trade_state: 'SUCCESS',
          success_time: new Date().toISOString(),
          amount: { total: 9900, currency: 'CNY' },
        }),
      },
    },
  };
}

// -------------------- 内部 API（billing） --------------------

export interface MockFreezePointsPayload {
  userId?: string;
  amount?: number;
  idempotencyKey?: string;
  workId?: string;
  description?: string;
}

/** 构造冻结积分请求体（内部 API） */
export function buildFreezePointsPayload(
  userId: string,
  override: MockFreezePointsPayload = {},
): MockFreezePointsPayload {
  return {
    userId,
    amount: 10,
    idempotencyKey: randomIdempotencyKey('freeze'),
    description: '集成测试冻结积分',
    ...override,
  };
}

/** 构造赠送积分请求体（内部 API） */
export function buildGrantPointsPayload(
  userId: string,
  amount: number,
  orderId: string,
  packageId: string,
  override: Partial<MockFreezePointsPayload> = {},
): {
  userId: string;
  amount: number;
  idempotencyKey: string;
  orderId: string;
  packageId: string;
  description?: string;
} {
  return {
    userId,
    amount,
    idempotencyKey: randomIdempotencyKey('grant'),
    orderId,
    packageId,
    description: '集成测试赠送积分',
    ...override,
  };
}
