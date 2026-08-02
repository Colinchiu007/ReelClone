/**
 * Jest 测试配置 — @reelclone/common
 */
module.exports = {
  displayName: 'common',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/index.ts'],
  coverageDirectory: '../../coverage/libs/common',
  moduleNameMapper: {
    '^@reelclone/common(|/.*)$': '<rootDir>/src/$1',
    '^@reelclone/platform-data$': '<rootDir>/../platform-data/src/index.ts',
    '^@reelclone/platform-data/(.*)$': '<rootDir>/../platform-data/src/$1',
    '^@reelclone/database$': '<rootDir>/../database/src/index.ts',
    '^@reelclone/database/(.*)$': '<rootDir>/../database/src/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
}
