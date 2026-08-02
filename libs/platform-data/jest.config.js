/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  displayName: 'platform-data',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleNameMapper: {
    '^@reelclone/database$': '<rootDir>/../database/src/index.ts',
    '^@reelclone/database/(.*)$': '<rootDir>/../database/src/$1',
    '^@reelclone/foundation$': '<rootDir>/../foundation/src/index.ts',
    '^@reelclone/foundation/(.*)$': '<rootDir>/../foundation/src/$1',
  },
}
