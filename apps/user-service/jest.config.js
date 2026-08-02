/**
 * Jest 测试配置 — @reelclone/user-service
 */
module.exports = {
  displayName: 'user-service',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts'],
  coverageDirectory: '../../coverage/apps/user-service',
  moduleNameMapper: {
    '^@reelclone/common(|/.*)$': '<rootDir>/../../libs/common/src/$1',
    '^@reelclone/database(|/.*)$': '<rootDir>/../../libs/database/src/$1',
    '^@reelclone/platform-data(|/.*)$': '<rootDir>/../../libs/platform-data/src/$1',
    '^@reelclone/adapters-sms(|/.*)$': '<rootDir>/../../libs/adapters-sms/src/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
}
