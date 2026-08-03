# Tasks — Phase 0/1/2 深度重构执行清单

> 最后更新：2026-08-03

## 进度总览

| Phase | 总计 | 已完成 | 进行中 |
| ----- | ---- | ------ | ------ |
| P0    | 6    | 6      | 0      |
| P1    | 13   | 13     | 0      |
| P2    | 4    | 0      | 0      |

## P0 — 生产就绪（6/6 ✅）

| #    | 任务                  | commit    | 状态 |
| ---- | --------------------- | --------- | ---- |
| P0-1 | Redis/DB 连接校验     | `4502d62` | ✅   |
| P0-2 | 错误码 & 响应格式统一 | `d087c6a` | ✅   |
| P0-3 | 用户封禁 RLS 守卫     | `979d8da` | ✅   |
| P0-4 | Redis 命名空间前缀    | `017651a` | ✅   |
| P0-5 | 限流守卫 Redis 桥接   | `25f4732` | ✅   |
| P0-6 | Auth 单元测试         | `0699377` | ✅   |

## P1 — 架构质量（13/13 ✅）

| #     | 任务                     | 状态 | 备注                                                                                            |
| ----- | ------------------------ | ---- | ----------------------------------------------------------------------------------------------- |
| P1-1  | 拆分 common 恢复依赖方向 | ✅   | `436c7e4` — RedisBridgeModule → platform-data，common 零 @reelclone/* 依赖                      |
| P1-2  | 邮件模板渲染             | ✅   | 标签修正：重构报告中 P1-2 实际为 Temporal 拆分，已在 P1-13 部分完成；项目无邮件系统，此标签无效 |
| P1-3  | V2 Billing 灰度          | ✅   | `68dfb27` + `882ec7a` + `5322be2`                                                               |
| P1-4  | Temporal 错误处理        | ✅   | 错误分类体系 TemporalError + 共享 mapper 提取，156 tests 通过                                   |
| P1-5  | Redis 缓存分层           | ✅   | CacheService (getOrSet/SCAN失效) + CacheModule.forRootAsync，template-service 首应用            |
| P1-6  | 配置拓扑收敛             | ✅   | `01d85fa` — ServiceConfigModule + ServiceJwtModule + RedisBridgeModule，11 服务迁移             |
| P1-7  | Outbox 状态机            | ✅   | 核心已在迁移 0009+0014 完成（attempts/退避/死信/replay），剩余为增强项                          |
| P1-8  | 可观测性闭环             | ✅   | AsyncLocalStorage traceId 隔离 + /metrics @Public + Nginx x-trace-id 透传                       |
| P1-9  | API 信任边界             | ✅   | findOne 状态过滤 + Guard caller 审计日志                                                        |
| P1-10 | 奖励补偿间隙饥饿         | ✅   | `26d6d1b` + `9832c7d`                                                                           |
| P1-11 | 密钥管理加密存储         | ✅   | AES-256-GCM 加密 ConfigStore，`enc:v1:` 前缀，迁移脚本                                          |
| P1-12 | Admin-service 代码审计   | ✅   | 补 @CurrentUser 审计 + config 导入修正 + 路由前缀注释                                           |
| P1-13 | Temporal 契约类型解耦    | ✅   | VideoMetaInfo → @reelclone/common，消除 temporal→ai 类型依赖                                    |

## P2 — 业务功能（0/4）

| #    | 任务              | 状态 |
| ---- | ----------------- | ---- |
| P2-1 | 微信支付分账      | ⬜   |
| P2-2 | 套餐到期自动降级  | ⬜   |
| P2-3 | 上传审核流程      | ⬜   |
| P2-4 | Temporal 重试策略 | ⬜   |
