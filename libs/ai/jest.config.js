/** @type {import('jest').Config} */
module.exports = {
  displayName: 'ai',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts', '**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/**/*.spec.ts'],
  coverageDirectory: '<rootDir>/../../coverage/libs/ai',
};
