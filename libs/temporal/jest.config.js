/**
 * Jest 配置 - @reelclone/temporal
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts', '**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@reelclone/temporal(|/.*)$': '<rootDir>/src$1',
    '^@reelclone/ai(|/.*)$': '<rootDir>/../ai/src$1',
    '^@reelclone/common(|/.*)$': '<rootDir>/../common/src$1',
    '^@reelclone/database(|/.*)$': '<rootDir>/../database/src$1',
    '^@reelclone/platform-data(|/.*)$': '<rootDir>/../platform-data/src/$1',
    '^@reelclone/oss(|/.*)$': '<rootDir>/../oss/src$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/index.ts'],
  coverageDirectory: '<rootDir>/../../coverage/libs/temporal',
}
