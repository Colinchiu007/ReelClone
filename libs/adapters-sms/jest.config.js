/**
 * Jest 测试配置 — @reelclone/adapters-sms
 */
module.exports = {
  displayName: 'adapters-sms',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/index.ts'],
  coverageDirectory: '../../coverage/libs/adapters-sms',
  moduleNameMapper: {
    '^@reelclone/common(|/.*)$': '<rootDir>/../common/src/$1',
    '^@reelclone/database(|/.*)$': '<rootDir>/../database/src/$1',
    '^@reelclone/adapters-sms(|/.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
}
