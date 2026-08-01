# ADR-003: real/mock 是运行时 profile 的组合 adapter，不是环境分支

- **状态**：Accepted
- **日期**：2026-08-01
- **关联文档**：CURRENT_ARCHITECTURE.md 第三节

---

## Context（背景）

当前 mock/real 切换通过环境变量（如 `TEMPORAL_MOCK_MODE`）作为业务函数内的条件分支实现。

问题：

- mock 与 real 逻辑交织在业务代码内部，无法证明某一个运行 profile（如 production profile）的完整行为。
- 条件分支遍布各处，测试无法隔离——单元测试可能触发真实 provider，集成测试无法确定性选择 adapter。
- 无法证明「生产 profile 只包含 real adapter」这一不变量。

13 号报告将此列为结构性问题。

## Decision（决策）

**real 与 mock 是组合时（composition time）选择的 adapter，不是运行时环境分支。**

具体含义：

- real provider 与 mock provider 实现同一接口合约，作为独立 adapter 存在。
- 在应用组合层（module 装配）根据 profile 选择注入哪个 adapter，业务函数内不再出现 `if mock` 分支。
- production profile fail closed——如果缺少 real adapter 的必要配置，启动即失败，绝不静默降级到 mock。
- 测试通过显式注入 mock adapter 实现隔离。

## Alternatives（备选方案）

1. **环境变量驱动分支（当前方式）**
   - 继续在业务函数内通过 `process.env` 判断 mock/real。
   - 否决理由：不可证明完整运行 profile；测试与生产路径交织；无法保证生产不误用 mock。

## Consequences（后果）

- **正向**：
  - production profile fail closed——生产环境绝不会因配置缺失而静默运行 mock。
  - 测试隔离——单元/集成测试通过 adapter 注入确定性选择 mock，不污染生产路径。
  - 可证明每个 profile 的完整行为（profile 是显式装配，而非隐式分支）。
- **负向**：
  - 需要为每个外部依赖定义 adapter 接口合约。
  - 模块装配层复杂度增加（需维护多套 profile 组合）。
  - 现有条件分支需要逐步迁移到 adapter 模式。
