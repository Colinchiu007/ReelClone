/** @type {import('jest').Config} */
module.exports = {
  displayName: 'ai',
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts', '**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/**/*.spec.ts'],
  coverageDirectory: '<rootDir>/../../coverage/libs/ai',
  moduleNameMapper: {
    '^@reelclone/temporal(|/.*)$': '<rootDir>/../temporal/src/$1',
  },
}
