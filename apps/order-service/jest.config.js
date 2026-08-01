/**
 * Jest 测试配置 — @reelclone/order-service
 */
module.exports = {
  displayName: 'order-service',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts'],
  coverageDirectory: '../../coverage/apps/order-service',
  moduleNameMapper: {
    '^@reelclone/common(|/.*)$': '<rootDir>/../../libs/common/src/$1',
    '^@reelclone/database(|/.*)$': '<rootDir>/../../libs/database/src/$1',
    '^@reelclone/adapters-wechat(|/.*)$': '<rootDir>/../../libs/adapters-wechat/src/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
}
