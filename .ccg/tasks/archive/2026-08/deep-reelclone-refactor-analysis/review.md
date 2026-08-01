# 质量节拍与 CCG 审查记录

## 审查范围

- 主报告：`01-docs/13-项目深度重构分析报告.md`
- 基线：`master@2ffed0e0b70021aef1c9a514033c938854554f2b`
- 审查目标：事实准确性、证据可定位性、优先级、路线可执行性、测试边界与范围控制。

## 审查来源

| 来源                           | 状态       | 用途                                                      |
| ------------------------------ | ---------- | --------------------------------------------------------- |
| generation/Temporal 专题 Agent | 完成       | 核验生成 saga、Provider、Temporal、计费终态与 mock/real   |
| billing/data 专题 Agent        | 完成       | 核验 reservation/outbox、legacy 双写、对账、迁移与恢复    |
| API/security 专题 Agent        | 完成       | 核验身份、Token、支付、OSS、SSRF、租户和内部 API          |
| test/delivery 专题 Agent       | 完成       | 核验 Jest/Nx、CI、Docker、Compose、E2E、health 和灾备     |
| 本地架构/Nx graph              | 完成       | 核验应用/库清单、依赖方向、代码与旧文档差异               |
| 独立 CCG report reviewer       | 完成       | 对 584 行初稿逐条抽查，产出 1 Critical、3 Warning、1 Info |
| antigravity analyzer/reviewer  | 无有效结论 | wrapper 启动，但本机 `agy` 不在 PATH，退出 127            |
| Claude analyzer/reviewer       | 无有效结论 | wrapper 生成空 `--setting-sources`，Claude 退出 1         |

外部模型均已按 CCG 要求调用并保留失败日志；本记录不把工具失败描述成“双模型审查通过”。

## 审查发现与处理

### Critical

1. 初稿低估身份边界：未把微信凭证缺失自动 Mock、Access/Refresh 混用和跨服务撤权漂移列为 P0。
   - 处理：已新增 `P0-1`，并同步执行摘要、Phase 0 和安全验收门禁。
2. 初稿对资产风险描述过窄：只覆盖 Workbench asset ownership，没有写明任意登记 OSS Key 后借服务端凭证删除的利用链。
   - 处理：已扩展 `P0-6`，加入 upload intent、HEAD 核验和 durable cleanup 验收方向。
3. 支付 P0 只覆盖密码学验签，没有要求把合法签名消息的商户、应用、订单、金额和币种与本地不变量绑定。
   - 处理：已扩展 `P0-2`、Phase 0 与安全门禁；任一业务字段不匹配必须零状态变更。

### Warning

1. 首轮报告仍写“完整后端 unit 未完成”，与第二轮运行结果不一致。
   - 处理：同时保留首轮 246 秒超时和复跑 72 suites / 877 tests 通过，并记录 `MaxListenersExceededWarning`。
2. API 契约风险分散在专题材料，主路线遗漏模板旁路、跨租户幂等键、共享内部密钥和前端 localhost 回退。
   - 处理：新增 `P1-9`，给出 contract test、service identity、durable idempotency 和 production build fail-closed 路线。
3. `5.1/5.2/5.3` 与父级标题同级，Markdown 目录层次错误。
   - 处理：修正为三级分类、四级具体发现。
4. “实时架构”把未部署的 admin、逻辑数据归属和进程实际四库/Redis 连接混在同一语义中。
   - 处理：改为“当前生产入口与逻辑数据归属”，明确 admin 未接入、数据边为逻辑归属，并记录实际宽连接。
5. P0-5 漏报 Temporal DB 密码、namespace 未创建和 migration 可跳过等 clean-deploy 阻断。
   - 处理：加入源码证据和 Phase 0 fresh bootstrap contract；Phase 3 只承担 N-1/故障注入/长稳强化。
6. 模板奖励补偿使用 `rewardCount` 猜测缺失 ordinal，可能永久漏发特定序号并使低热度模板饥饿。
   - 处理：新增 `P1-10`，要求 durable ordinal gap、稳定游标和全量可达性。
7. “106 个测试文件”缺少可复现口径。
   - 处理：明确 100 个标准 suite + 6 个 integration setup/helper，统计 21,888 个非空行；同时写明 45,092 行源码口径。

### Info

1. 不采用“大爆炸重写、先合并服务、先上 Kubernetes”的结论与当前风险顺序一致。
2. V2 reservation/outbox、确定性 workflow ID、Provider 未确认前不退款等现有资产已明确列入保留清单。
3. 报告把当前代码、旧文档设想和 production evidence 分层，没有把本地单测当上线证明。

## 验证记录

| 检查                                      | 结果                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `npm run typecheck`                       | 通过                                                                       |
| `npm run lint`                            | 通过；范围不含 TSX、脚本和配置                                             |
| `npm run test:miniprogram -- --runInBand` | 18 suites / 302 tests 通过；有 React `act(...)` 警告                       |
| generation/Temporal 定向测试              | 4 suites / 53 tests 通过                                                   |
| billing 定向测试                          | 3 suites / 51 tests 通过                                                   |
| `npm run test:unit -- --runInBand` 复跑   | 72 suites / 877 tests 通过；有 listener 清理警告                           |
| `npm run test:integration`                | 失败；`jest.integration.config.js` 不存在                                  |
| 完整 `file:line` 引用检查                 | 定稿 79 个完整文件引用均存在且未越界                                       |
| Markdown 标题结构                         | 通过人工层级检查                                                           |
| whitespace                                | `git diff --no-index --check` 无 whitespace error；仅报告 LF/CRLF 转换警告 |

## 门禁结论

- **报告交付门禁：通过，带外部模型不可用限制。** 报告覆盖用户要求的深度代码理解、重构优先级、目标结构、阶段路线和验收标准。
- **项目生产门禁：失败。** 身份、支付、资金一致性、生成恢复、外部资源和 CI/CD 仍有 P0；真实基础设施与生产闭环未验收。
- **范围门禁：通过。** 本任务只新增报告和 CCG 任务材料，没有修改业务代码，也没有触碰既有未跟踪配置/其他任务。

## 遗留限制

1. antigravity/Claude 未产生有效外部审查结论，只有失败证据。
2. 没有真实 PostgreSQL、Redis、Temporal、OSS、Seedance、微信登录/支付或云部署验证。
3. 当前 coverage 是旧快照；本轮没有生成实时覆盖率。
4. 本任务只形成重构决策输入，没有修复报告列出的产品缺陷。
