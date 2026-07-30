/**
 * Taro API mock for Jest tests
 *
 * Provides in-memory storage and basic Taro API mocks,
 * enabling unit tests of stores/services/hooks that depend on Taro.
 *
 * Mock 状态重置：
 *  - `__resetMockStorage()` 清空同步存储（在 jest.setup.ts afterEach 中调用）
 *  - `__resetTaroMocks()` 重置所有 jest.fn 的 mock 调用记录与实现
 *  - `__resetAll()` 同时执行上述两种重置（推荐在 beforeEach 中调用）
 */

/** In-memory storage backing for Taro.getStorageSync / setStorageSync / removeStorageSync */
const mockStorage: Record<string, string> = {}

/** Reset all storage state — called in jest.setup.ts afterEach */
export function __resetMockStorage(): void {
  for (const key of Object.keys(mockStorage)) {
    delete mockStorage[key]
  }
}

/** Reset all jest.fn mock state (calls + implementations) */
export function __resetTaroMocks(): void {
  const fns = [
    TaroMock.getStorageSync,
    TaroMock.setStorageSync,
    TaroMock.removeStorageSync,
    TaroMock.base64ToArrayBuffer,
    TaroMock.request,
    TaroMock.showToast,
    TaroMock.showLoading,
    TaroMock.hideLoading,
    TaroMock.showModal,
    TaroMock.navigateTo,
    TaroMock.navigateBack,
    TaroMock.redirectTo,
    TaroMock.switchTab,
    TaroMock.reLaunch,
    TaroMock.uploadFile,
    TaroMock.downloadFile,
    TaroMock.connectSocket,
    TaroMock.login,
  ]
  for (const fn of fns) {
    fn.mockReset()
  }
  // 重新绑定 getStorageSync/setStorageSync/removeStorageSync 到内存存储
  // （mockReset 会清除 implementation）
  TaroMock.getStorageSync.mockImplementation((key: string) => mockStorage[key] ?? '')
  TaroMock.setStorageSync.mockImplementation((key: string, value: string) => {
    mockStorage[key] = value
  })
  TaroMock.removeStorageSync.mockImplementation((key: string) => {
    delete mockStorage[key]
  })
}

/** Reset both storage and mock state — recommended in beforeEach */
export function __resetAll(): void {
  __resetMockStorage()
  __resetTaroMocks()
}

const TaroMock = {
  // ---- 同步存储 ----
  getStorageSync: jest.fn((key: string) => mockStorage[key] ?? ''),
  setStorageSync: jest.fn((key: string, value: string) => {
    mockStorage[key] = value
  }),
  removeStorageSync: jest.fn((key: string) => {
    delete mockStorage[key]
  }),

  // ---- Base64 解码（token.spec.ts 依赖） ----
  base64ToArrayBuffer: jest.fn((b64: string) => {
    const buffer = Buffer.from(b64, 'base64')
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  }),

  // ---- HTTP 请求（token.spec.ts refreshAccessToken + request.spec.ts 依赖） ----
  request: jest.fn(),

  // ---- UI 提示（部分组件/页面依赖） ----
  showToast: jest.fn(),
  showLoading: jest.fn(),
  hideLoading: jest.fn(),
  showModal: jest.fn(),

  // ---- 导航（部分页面/RequestManager handleAuthFailure 依赖） ----
  navigateTo: jest.fn(),
  navigateBack: jest.fn(),
  redirectTo: jest.fn(),
  switchTab: jest.fn(),
  reLaunch: jest.fn(),

  // ---- 上传/下载 ----
  uploadFile: jest.fn(),
  downloadFile: jest.fn(),

  // ---- WebSocket（useWebSocket 依赖） ----
  connectSocket: jest.fn(),

  // ---- 登录（useAuth 依赖） ----
  login: jest.fn(),

  // ---- SocketTask 类型（仅供类型引用，运行时由 connectSocket 返回） ----
  SocketTask: class SocketTask {},
}

export default TaroMock
