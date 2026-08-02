/**
 * Jest 测试配置 — @reelclone/adapters-wechat
 */
module.exports = {
  displayName: 'adapters-wechat',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/index.ts'],
  coverageDirectory: '../../coverage/libs/adapters-wechat',
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
  moduleNameMapper: {
    '^@reelclone/common(|/.*)$': '<rootDir>/../common/src/$1',
    '^@reelclone/database(|/.*)$': '<rootDir>/../database/src/$1',
    '^@reelclone/platform-data(|/.*)$': '<rootDir>/../platform-data/src/$1',
  },
}
