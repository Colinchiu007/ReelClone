/**
 * 根级 Jest 配置 — 统一运行所有子包的单元测试
 *
 * 使用 projects 模式收集各子包的 jest.config.js，
 * 如果子包没有独立配置则回退到 ts-jest preset。
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.base.json', isolatedModules: true }],
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
  // 阈值逐步提高，防止覆盖率回归；后续通过补充单元测试继续提升
  coverageThreshold: {
    global: {
      statements: 52,
      branches: 35,
      functions: 37,
      lines: 52,
    },
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/tests/integration/',
    '/apps/miniprogram/',
    // 防止加载 libs/*/dist 中的旧编译产物（根因：TS 模块解析可能命中 dist/.js）
    '/libs/[^/]+/dist/',
    '/libs/[^/]+/build/',
  ],
  moduleNameMapper: {
    '^@reelclone/(common|database|platform-data|ai|temporal|oss|observability|swagger|adapters-wechat|adapters-sms|http-client|capability)(|/.*)$':
      '<rootDir>/libs/$1/src/$2',
  },
  // ali-oss 6.23+ 在 lib/ 中同时发布 .ts 源文件，ts-jest 默认不转换 node_modules
  // 启用 isolatedModules 跳过类型检查后可安全转换
  transformIgnorePatterns: ['/node_modules/(?!ali-oss)'],
}
