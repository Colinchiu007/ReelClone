# ADR-004: CI 制品是唯一发布输入，生产不现场构建

- **状态**：Accepted
- **日期**：2026-08-01
- **关联文档**：CURRENT_ARCHITECTURE.md 第五节、`01-docs/13-项目深度重构分析报告.md`

---

## Context（背景）

当前发布流程存在两个问题：

1. **CI 产生 false green**：CI 流水线（`.github/workflows/ci.yml`）通过不代表制品可部署，因为生产构建与 CI 构建环境不一致。
2. **生产在服务器 git pull 后构建 mutable latest**：当前生产 Compose 使用 `build: { context, dockerfile }` 现场构建镜像，且镜像 tag 为 `reelclone/<service>:latest`——这是 mutable tag，无法回滚到确定版本。

这种模式下，同一 `:latest` tag 在不同时间点指向不同内容，部署不可重复，回滚无依据。

## Decision（决策）

**CI 制品是唯一发布输入，生产环境不现场构建。**

具体含义：

- CI 流水线构建镜像并推送至 registry，镜像 tag 使用不可变 digest（或 git commit sha），不使用 mutable `:latest`。
- 生产环境通过拉取指定 digest 的镜像部署，不在服务器上执行 `git pull` + `docker build`。
- 部署清单（Compose 或未来 K8s）引用具体 digest，确保可重复部署。

## Alternatives（备选方案）

1. **服务器现场构建（当前方式）**
   - 生产服务器 `git pull` 后 `docker compose build`。
   - 否决理由：不可重复——同一 commit 在不同服务器/时间构建可能产生不同制品；依赖服务器本地环境；回滚困难（`:latest` 已被覆盖）。

## Consequences（后果）

- **正向**：
  - 部署可重复——同一 digest 部署结果一致。
  - 回滚通过 digest 切换实现，快速且确定性。
  - CI green 与可部署性对齐——CI 产出的制品即生产输入。
- **负向**：
  - 需要引入 container registry（自建或云服务）。
  - 发布流程变更，需更新部署 Runbook。
  - 服务器需要配置 registry 凭证。
