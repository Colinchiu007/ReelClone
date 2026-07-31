/**
 * Jest 测试配置 — @reelclone/miniprogram
 *
 * 测试范围：stores（Zustand 状态管理）+ services（token/request 纯逻辑）+ hooks + components
 * 组件测试：通过 __mocks__/@tarojs/components.tsx 将 Taro 组件映射到 HTML 元素
 */
module.exports = {
  displayName: 'miniprogram',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  testRegex: '.*\\.spec\\.tsx?$',
  transform: {
    '^.+\\.[jt]sx?$': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true },
    ],
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  collectCoverageFrom: [
    'src/stores/**/*.ts',
    'src/services/**/*.ts',
    'src/hooks/**/*.ts',
    'src/components/**/*.tsx',
    '!src/**/*.spec.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/**/index.ts',
  ],
  coverageDirectory: '../../coverage/apps/miniprogram',
  // 覆盖率阈值门禁 — 基于基线 (Stmts 78.22% / Branches 65.46% / Funcs 76.96% / Lines 78.53%)
  // 全局阈值设保守值（留余地给新组件），防止覆盖率回归
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 55,
      functions: 70,
      lines: 70,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tarojs/taro$': '<rootDir>/__mocks__/taro.ts',
    '^@tarojs/components$': '<rootDir>/__mocks__/@tarojs/components.tsx',
    '\\.(scss|css|sass)$': 'identity-obj-proxy',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
}
