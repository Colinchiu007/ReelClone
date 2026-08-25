/**
 * Jest 测试配置 — @reelclone/admin-web
 *
 * 测试范围：pages 页面渲染测试（React 18 + Ant Design v5 + jsdom）
 * 注意：admin-web 为 "type": "module"，故本文件使用 .cjs 扩展名。
 * ts-jest 通过 tsconfig.spec.json 编译 TSX（module=CommonJS，jsdom 下可运行）。
 */
module.exports = {
  displayName: 'admin-web',
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  // 不显式设置 rootDir：默认以配置文件所在目录为 rootDir，
  // 支持在 apps/admin-web 或仓库根目录任意位置调用
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json'],
  testRegex: '.*\\.spec\\.tsx$',
  transform: {
    '^.+\\.[jt]sx?$': [
      'ts-jest',
      { tsconfig: '<rootDir>/tsconfig.spec.json', isolatedModules: true },
    ],
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  collectCoverageFrom: [
    'src/pages/**/*.tsx',
    '!src/pages/**/*.spec.tsx',
    '!src/pages/**/__tests__/**',
  ],
  coverageDirectory: '../../coverage/apps/admin-web',
  // 覆盖率阈值门禁 — 保守值，防止覆盖率回归（页面逐步补测后按基线提升）
  coverageThreshold: {
    global: {
      statements: 10,
      branches: 10,
      functions: 10,
      lines: 10,
    },
  },
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  // antd v5 + jsdom 首次渲染较重，放宽单测超时（默认 5s 对 CI 低配 runner 偏紧）
  testTimeout: 15000,
  testPathIgnorePatterns: ['/node_modules/'],
}