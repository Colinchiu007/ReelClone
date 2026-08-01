# Runbook: 部署流程

> **本文档为骨架占位，待 ADR-004（build-once-deploy-by-digest）落地后补充实际步骤。**
> **当前部署方式见 CURRENT_ARCHITECTURE.md 第五节——生产使用 Docker Compose 现场构建，非 digest 部署。**

---

## 一、发布前检查

<!-- TODO: 补充发布前检查清单 -->
<!-- 检查项示例：
- CI 流水线是否全绿
- migration 是否已 review 并在 staging 验证
- 依赖服务（postgres/redis/temporal）健康状态
- INTERNAL_API_KEY 等环境变量是否就绪
- 当前生产 digest / commit 记录（用于回滚基准）
-->

- [ ] <!-- TODO: CI 全绿确认 -->
- [ ] <!-- TODO: migration 验证 -->
- [ ] <!-- TODO: 基础设施健康检查 -->
- [ ] <!-- TODO: 环境变量就绪检查 -->
- [ ] <!-- TODO: 回滚基准记录 -->

---

## 二、部署步骤

<!-- TODO: 补充实际部署步骤 -->
<!-- 当前方式（待 ADR-004 落地后替换）：
  cd docker
  cp .env.production.example .env.production  # 编辑真实凭证
  docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
-->

<!-- 目标方式（ADR-004 落地后）：
  1. 从 registry 拉取指定 digest 镜像
  2. 更新 docker-compose.prod.yml 镜像引用为 digest
  3. docker compose up -d（不现场构建）
  4. 等待 healthcheck 通过
-->

1. <!-- TODO: 部署步骤 1 -->
2. <!-- TODO: 部署步骤 2 -->
3. <!-- TODO: 部署步骤 3 -->
4. <!-- TODO: healthcheck 验证 -->

---

## 三、回滚流程

<!-- TODO: 补充回滚流程 -->
<!-- 回滚策略（ADR-004 落地后）：通过 digest 切换回上一版本镜像，无需重新构建 -->
<!-- 当前回滚方式：git checkout <previous-commit> + docker compose build，不可靠 -->

1. <!-- TODO: 回滚步骤 1 -->
2. <!-- TODO: 回滚步骤 2 -->
3. <!-- TODO: 回滚后验证 -->

---

## 四、部署后验证

<!-- TODO: 补充部署后验证项 -->

- [ ] <!-- TODO: Nginx /health 端点 -->
- [ ] <!-- TODO: 各微服务 healthcheck -->
- [ ] <!-- TODO: 关键业务流程冒烟测试 -->
