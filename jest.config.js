/**
 * 根级 Jest 配置 — 统一运行所有子包的单元测试
 *
 * 使用 projects 模式收集各子包的 jest.config.js，
 * 如果子包没有独立配置则回退到 ts-jest preset。
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.base.json' }],
  },
  collectCoverageFrom: [
    'apps/**/src/**/*.ts',
    'libs/**/src/**/*.ts',
    '!**/*.spec.ts',
    '!**/*.module.ts',
    '!**/main.ts',
    '!**/index.ts',
  ],
  coverageDirectory: './coverage',
  // 覆盖率阈值门禁 — 基于基线 (Stmts 54.52% / Branches 38.29% / Funcs 40.62% / Lines 54.17%)
  // 后端整体覆盖率偏低主要因 Temporal workflows/activities（声明式代码，由 E2E 10 套件 95 测试覆盖）
  // 阈值设基线以下约 5%，防止覆盖率回归；后续通过补充单元测试逐步提高基线和阈值
  coverageThreshold: {
    global: {
      statements: 50,
      branches: 33,
      functions: 35,
      lines: 50,
    },
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/tests/integration/',
    '/apps/miniprogram/',
  ],
  moduleNameMapper: {
    '^@reelclone/(common|database|ai|temporal|oss)(|/.*)$': '<rootDir>/libs/$1/src/$2',
  },
}
