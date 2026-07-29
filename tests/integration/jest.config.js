/**
 * Jest 集成测试配置 — ReelClone E2E
 *
 * 特点：
 *  - 使用 ts-jest 转换 TS（对齐各微服务 spec 配置）
 *  - setupFilesAfterEach 在每个测试前执行 setup.ts（环境检查 / 种子）
 *  - globalTeardown 在所有测试结束后执行 teardown.ts（清理）
 *  - 默认 60s 超时（E2E 涉及多服务，耗时较长）
 *  - 测试文件按 flows → api 顺序执行（保证用户路径优先）
 */
module.exports = {
  displayName: 'reelclone-e2e',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
  globalTeardown: '<rootDir>/teardown.ts',
  testTimeout: 60000,
  // 顺序：先跑用户路径（flows），再跑 API 单元集成（api）
  testMatch: [
    '**/flows/**/*.spec.ts',
    '**/api/**/*.spec.ts',
  ],
  // 按 spec 文件名顺序执行（001 → 002 → ...），保证依赖前置
  collectCoverageFrom: ['helpers/**/*.ts', 'flows/**/*.ts', 'api/**/*.ts'],
  coverageDirectory: './coverage',
  // 强制串行执行（E2E 共享 DB / Redis，并行会互相干扰）
  maxWorkers: 1,
  verbose: true,
};
