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
