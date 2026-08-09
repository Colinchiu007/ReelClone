/**
 * Jest 集成测试配置（根目录入口）
 *
 * package.json 的 test:integration 脚本通过 --config jest.integration.config.js 引用此文件。
 * 复用 tests/integration/jest.config.js 的配置，仅修正 rootDir 为正确的相对路径。
 */
module.exports = {
  ...require('./tests/integration/jest.config.js'),
  rootDir: './tests/integration',
}
