/**
 * Jest 测试配置 — @reelclone/template-service
 *
 * 使用 isolatedModules 跳过类型检查（仅转译），避免 libs/temporal
 * 中 @temporalio 版本差异导致的预存类型错误影响测试运行。
 */
module.exports = {
  displayName: 'template-service',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        isolatedModules: true,
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts'],
  coverageDirectory: '../../coverage/apps/template-service',
  moduleNameMapper: {
    '^@reelclone/common(|/.*)$': '<rootDir>/../../libs/common/src/$1',
    '^@reelclone/database(|/.*)$': '<rootDir>/../../libs/database/src/$1',
    '^@reelclone/temporal(|/.*)$': '<rootDir>/../../libs/temporal/src/$1',
    '^@reelclone/observability(|/.*)$': '<rootDir>/../../libs/observability/src/$1',
    '^@reelclone/http-client(|/.*)$': '<rootDir>/../../libs/http-client/src/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
}
