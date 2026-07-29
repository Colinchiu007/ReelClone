/**
 * commitlint 配置文件
 * 使用 @commitlint/config-conventional 约定式提交规范
 * 文档: https://commitlint.js.org/
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 提交类型: feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert
    'type-enum': [
      2,
      'always',
      [
        'feat', // 新功能
        'fix', // 修复 Bug
        'docs', // 文档变更
        'style', // 代码格式（不影响功能）
        'refactor', // 重构（既不是新增功能，也不是修复 Bug）
        'perf', // 性能优化
        'test', // 增加/修改测试
        'build', // 构建系统或外部依赖变更
        'ci', // CI 配置变更
        'chore', // 杂项（不修改 src 或测试的其他变更）
        'revert', // 回滚提交
      ],
    ],
    // 类型不能为空
    'type-empty': [2, 'never'],
    // 提交描述不能为空
    'subject-empty': [2, 'never'],
    // 提交描述不能以句号结尾
    'subject-full-stop': [0],
    // 提交描述大小写
    'subject-case': [0],
    // header 最大长度
    'header-max-length': [2, 'always', 100],
    // body 每行最大长度
    'body-max-line-length': [1, 'always', 120],
    // footer 每行最大长度
    'footer-max-line-length': [1, 'always', 120],
  },
};
