/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  displayName: 'http-client',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^@reelclone/common(|/.*)$': '<rootDir>/../../libs/common/src/$1',
    '^@reelclone/platform-data(|/.*)$': '<rootDir>/../../libs/platform-data/src/$1',
    '^@reelclone/database(|/.*)$': '<rootDir>/../../libs/database/src/$1',
  },
}
