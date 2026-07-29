/**
 * @reelclone/oss Jest 配置
 * 项目根目录未提供 jest.preset.js，使用独立配置 + ts-jest
 * 运行测试前请确保已安装：jest、ts-jest、@types/jest
 */
module.exports = {
  displayName: 'oss',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/src/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
    '!src/index.ts',
  ],
  coverageDirectory: '../../coverage/libs/oss',
  moduleNameMapper: {
    '^@reelclone/oss(|/.*)$': '<rootDir>/src$1',
  },
};
