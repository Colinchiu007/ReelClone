/**
 * Jest 测试配置 — @reelclone/miniprogram
 *
 * 测试范围：stores（Zustand 状态管理）+ services（token/request 纯逻辑）
 * 组件测试：后续迭代接入 @tarojs/test-utils-react
 */
module.exports = {
  displayName: 'miniprogram',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  testRegex: '.*\\.spec\\.tsx?$',
  transform: {
    '^.+\\.[jt]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  collectCoverageFrom: [
    'src/stores/**/*.ts',
    'src/services/**/*.ts',
    '!src/**/*.spec.{ts,tsx}',
    '!src/**/__tests__/**',
  ],
  coverageDirectory: '../../coverage/apps/miniprogram',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tarojs/taro$': '<rootDir>/__mocks__/taro.ts',
    '\\.(scss|css|sass)$': 'identity-obj-proxy',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
}
