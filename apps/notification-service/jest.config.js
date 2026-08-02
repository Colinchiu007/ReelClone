/**
 * Jest 测试配置 — @reelclone/notification-service
 */
module.exports = {
  displayName: 'notification-service',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/src/**/*.test.ts'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/**/*.test.ts', '!src/main.ts'],
  coverageDirectory: '../../coverage/apps/notification-service',
  moduleNameMapper: {
    '^@reelclone/common(|/.*)$': '<rootDir>/../../libs/common/src$1',
    '^@reelclone/database(|/.*)$': '<rootDir>/../../libs/database/src$1',
    '^@reelclone/platform-data(|/.*)$': '<rootDir>/../../libs/platform-data/src/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
}
