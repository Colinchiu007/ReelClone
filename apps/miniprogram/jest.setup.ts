/**
 * Jest 全局 setup — 每个测试文件执行前运行
 *
 * 职责：
 *  1. 注入 Taro defineConstants 常量（构建时注入，测试环境需手动定义）
 *  2. 启用 React 18 act() 测试环境（消除 "not configured to support act" 警告）
 *  3. 在 afterEach 中重置 Taro mock 的存储状态和 mock 调用记录
 */
import { __resetMockStorage } from './__mocks__/taro'

// Taro defineConstants 注入的全局常量（构建时由 webpack DefinePlugin 注入，测试环境需手动定义）
;(globalThis as any).API_BASE_URL = 'http://localhost:3000/api'
;(globalThis as any).WS_BASE_URL = 'ws://localhost:3008'

// 启用 React 18 act() 测试环境（hooks 测试需要）
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  jest.clearAllMocks()
  __resetMockStorage()
})
