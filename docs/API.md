# ReelClone API 文档

> 9 个后端微服务的完整 API 端点清单。
>
> 所有 HTTP 接口统一前缀 `/api/v1`，由各服务 `main.ts` 中的 `app.setGlobalPrefix('api/v1')` 设置。
> 所有响应均被全局 `ResponseInterceptor` 包装为 `{ code, message, data, traceId }` 结构（`code: 0` 表示成功）。
>
> - **Swagger UI**：开发环境下访问 `http://localhost:<PORT>/api/docs`
> - **OpenAPI JSON**：`http://localhost:<PORT>/api/docs-json`
> - 鉴权方式：
>   - JWT Bearer：`Authorization: Bearer <accessToken>`（由 auth-service 签发）
>   - 内部 API Key：`x-api-key: <INTERNAL_API_KEY>`（仅微服务间调用）
> - 文档约定：标注 `[内部 API]` 的接口不对小程序公开。

---

## 目录

- [1. Auth Service（认证服务）](#1-auth-service认证服务) — 端口 3001
- [2. User Service（用户服务）](#2-user-service用户服务) — 端口 3002
- [3. Asset Service（资产服务）](#3-asset-service资产服务) — 端口 3003
- [4. Benchmark Service（对标解析服务）](#4-benchmark-service对标解析服务) — 端口 3004
- [5. Template Service（模板服务）](#5-template-service模板服务) — 端口 3005
- [6. Billing Service（积分计费服务）](#6-billing-service积分计费服务) — 端口 3006
- [7. Workbench Service（创作工作台服务）](#7-workbench-service创作工作台服务) — 端口 3007
- [8. Notification Service（通知服务）](#8-notification-service通知服务) — 端口 3008
- [9. Order Service（订单与支付服务）](#9-order-service订单与支付服务) — 端口 3009
- [附录 A. 统一响应格式](#附录-a-统一响应格式)
- [附录 B. 错误码表](#附录-b-错误码表)
- [附录 C. 分页查询约定](#附录-c-分页查询约定)

---

## 1. Auth Service（认证服务）

> 端口：3001 ｜ 路由前缀：`/api/v1/auth`
>
> 职责：微信小程序登录、JWT Token 刷新、登出（Token 黑名单）。
> Swagger tag：`auth`

### 1.1 POST /auth/wechat-login

微信小程序登录。

- **鉴权**：公开（`@Public`）
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| code | string | 是 | `wx.login()` 返回的临时凭证（5 分钟有效） |
| nickname | string | 否 | 用户昵称（首次注册时使用，≤64 字符） |
| avatarUrl | string | 否 | 用户头像 URL（首次注册时使用，≤512 字符） |

- **响应体**（`data`）：

```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "eyJhbGciOi...",
  "user": {
    "id": "01HZX...",
    "openId": "o_xxx",
    "unionId": null,
    "nickname": "用户a1b2c3",
    "avatarUrl": null,
    "mobile": null,
    "status": "ACTIVE",
    "currentPoints": 0,
    "totalPoints": 0
  },
  "isNewUser": true
}
```

- **示例请求**：

```bash
curl -X POST http://localhost:3001/api/v1/auth/wechat-login \
  -H "Content-Type: application/json" \
  -d '{"code":"0837xxxxxx","nickname":"阿强"}'
```

### 1.2 POST /auth/refresh-token

刷新 Token。

- **鉴权**：公开
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| refreshToken | string | 是 | 上一次签发的 Refresh Token |

- **响应体**（`data`）：

```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "eyJhbGciOi..."
}
```

### 1.3 POST /auth/logout

登出（将当前 Access Token 的 `jti` 加入 Redis 黑名单，TTL = 剩余有效期）。

- **鉴权**：JWT Bearer
- **请求体**：无
- **响应体**（`data`）：`{ "success": true }`

### 1.4 GET /auth/health

健康检查（Docker/K8s 探针用）。

- **鉴权**：公开
- **响应体**（`data`）：

```json
{
  "status": "ok",
  "service": "auth-service",
  "timestamp": "2026-07-29T08:00:00.000Z"
}
```

---

## 2. User Service（用户服务）

> 端口：3002 ｜ 路由前缀：`/api/v1/users`、`/api/v1/sms`
>
> 职责：用户信息查询与更新、绑定手机号、修改密码、短信验证码。
> Swagger tag：`user`

### 2.1 GET /users/me

获取当前登录用户完整信息（不含 password）。

- **鉴权**：JWT Bearer
- **响应体**（`data`）：用户实体（脱敏后）

```json
{
  "id": "01HZX...",
  "openId": "o_xxx",
  "unionId": null,
  "nickname": "阿强",
  "avatarUrl": "https://...",
  "mobile": "138****1234",
  "email": null,
  "status": "ACTIVE",
  "currentPoints": 1200,
  "totalPoints": 3000,
  "industryPreferences": ["美食", "种草"],
  "lastLoginAt": "2026-07-29T08:00:00.000Z",
  "createdAt": "2026-07-01T00:00:00.000Z"
}
```

### 2.2 PUT /users/me

更新当前用户信息。

- **鉴权**：JWT Bearer
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| nickname | string | 否 | 昵称（≤64 字符） |
| avatarUrl | string | 否 | 头像 URL（≤512 字符） |
| email | string | 否 | 邮箱（≤128 字符） |
| industryPreferences | string[] | 否 | 行业偏好标签列表 |

- **响应体**（`data`）：更新后的用户实体

### 2.3 POST /users/bind-mobile

绑定手机号（校验短信验证码 → 更新 `user.mobile`）。

- **鉴权**：JWT Bearer
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| mobile | string | 是 | 手机号 |
| code | string | 是 | 短信验证码 |
| purpose | string | 是 | 验证码用途（如 `bind_mobile`） |

- **响应体**（`data`）：`{ "success": true }`

### 2.4 PUT /users/password

修改密码（已设置密码用旧密码验证，未设置密码用短信验证码验证）。

- **鉴权**：JWT Bearer
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| oldPassword | string | 否 | 旧密码（已设置密码时必填） |
| newPassword | string | 是 | 新密码 |
| mobile | string | 否 | 手机号（未设置密码时必填） |
| code | string | 否 | 短信验证码（未设置密码时必填） |

- **响应体**（`data`）：`{ "success": true }`

### 2.5 POST /sms/send

发送短信验证码（限流：60 秒内 10 次；同一手机号 60s 内只能发一次）。

- **鉴权**：JWT Bearer
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| mobile | string | 是 | 手机号 |
| purpose | string | 是 | 用途（`bind_mobile` / `change_password`） |

- **响应体**（`data`）：

```json
{
  "mobile": "13800001234",
  "purpose": "bind_mobile",
  "expireSeconds": 300
}
```

> Mock 模式下额外返回 `mockCode` 字段，便于联调。

---

## 3. Asset Service（资产服务）

> 端口：3003 ｜ 路由前缀：`/api/v1/assets`、`/api/v1/avatar-groups`
>
> 职责：用户素材资产（图片/视频/音频）管理、真人形象组管理、OSS 直传凭证签发。
> Swagger tag：`asset`

### 3.1 POST /assets/upload-token

获取 STS 上传凭证 + 表单上传 Policy/Signature，供小程序直传 OSS。

- **鉴权**：JWT Bearer
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| fileType | string | 是 | `image` / `video` / `audio` |
| fileName | string | 是 | 原始文件名（≤255 字符，用于推断扩展名） |
| contentType | string | 否 | MIME 类型 |

- **响应体**（`data`）：`{ ossKey, host, policy, signature, ... }`（OSS 直传所需字段）

### 3.2 GET /assets

资产列表（仅返回当前用户 ACTIVE 资产，支持分页与筛选）。

- **鉴权**：JWT Bearer
- **Query 参数**：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页条数，默认 20 |
| type | string | 否 | 资产类型筛选（IMAGE/VIDEO/AUDIO） |
| avatarGroupId | string | 否 | 按真人形象组筛选 |

- **响应体**（`data`）：分页结构 `{ list, page, pageSize, total }`

### 3.3 POST /assets

用户直传 OSS 完成后登记资产记录。

- **鉴权**：JWT Bearer
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| ossKey | string | 是 | 对象存储 Key（≤512 字符） |
| name | string | 是 | 文件名（≤255 字符） |
| type | string | 是 | 资产类型（IMAGE/VIDEO/AUDIO） |
| size | number | 是 | 文件大小（字节） |
| mimeType | string | 否 | MIME 类型（≤128 字符） |
| duration | number | 否 | 音视频时长（秒） |
| thumbnailKey | string | 否 | 缩略图 OSS Key |
| avatarGroupId | string | 否 | 所属真人形象组 ID |

- **响应体**（`data`）：创建后的资产实体

### 3.4 GET /assets/:id

资产详情（校验所有权）。

- **鉴权**：JWT Bearer
- **响应体**（`data`）：资产实体

### 3.5 DELETE /assets/:id

删除资产：删除 OSS 文件 + 软删除数据库记录（校验所有权）。

- **鉴权**：JWT Bearer
- **响应体**（`data`）：`{ success: true }`

### 3.6 POST /avatar-groups

创建真人形象组（同用户下名称唯一）。

- **鉴权**：JWT Bearer
- **请求体**：`{ name: string, description?: string }`
- **响应体**（`data`）：形象组实体

### 3.7 GET /avatar-groups

当前用户的真人形象组列表（仅 ACTIVE，分页）。

- **鉴权**：JWT Bearer
- **Query**：`page`、`pageSize`
- **响应体**（`data`）：分页结构

### 3.8 GET /avatar-groups/:id

形象组详情（含组内资产列表）。

- **鉴权**：JWT Bearer
- **响应体**（`data`）：形象组实体 + `assets` 数组

### 3.9 PUT /avatar-groups/:id

更新形象组（名称变更时重新校验唯一性）。

- **鉴权**：JWT Bearer
- **请求体**：`{ name?: string, description?: string }`

### 3.10 DELETE /avatar-groups/:id

删除形象组：级联删除组内所有资产（OSS + DB）后软删除形象组。

- **鉴权**：JWT Bearer
- **响应体**（`data`）：`{ success: true }`

---

## 4. Benchmark Service（对标解析服务）

> 端口：3004 ｜ 路由前缀：`/api/v1/benchmarks`
>
> 职责：竞品视频对标解析（下载 → 视频分析 → LLM 提炼脚本结构 → 输出可复用模板）。
> Swagger tag：`benchmark`

### 4.1 POST /benchmarks

提交对标解析任务。

- **鉴权**：JWT Bearer
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| sourceUrl | string | 是 | 对标视频链接（抖音/小红书/B站/快手/微博/视频号，≤1024 字符） |
| idempotencyKey | string | 否 | 幂等键（未提供时服务端生成） |

- **响应体**（`data`）：

```json
{
  "benchmarkId": "01HZX...",
  "status": "PENDING",
  "estimatedPoints": 50
}
```

### 4.2 GET /benchmarks

解析历史（分页 + 筛选）。

- **鉴权**：JWT Bearer
- **Query**：`page`、`pageSize`、`platform?`、`status?`
- **响应体**（`data`）：分页结构

### 4.3 GET /benchmarks/:id

解析详情（校验所有权）。

- **鉴权**：JWT Bearer
- **响应体**（`data`）：benchmark 实体（含解析结果 `result` 字段）

### 4.4 POST /benchmarks/:id/cancel

取消解析任务。

- **鉴权**：JWT Bearer
- **响应体**（`data`）：`{ benchmarkId, status: "CANCELLED" }`

---

## 5. Template Service（模板服务）

> 端口：3005 ｜ 路由前缀：`/api/v1/templates`、`/api/v1/users/industry-preferences`
>
> 职责：模板广场、模板详情、收藏管理、行业偏好设置。
> Swagger tag：`template`

### 5.1 GET /templates

模板广场列表（公开，支持分页 + 平台/行业/关键词筛选 + heat/latest/iq 排序）。

- **鉴权**：公开
- **Query**：`page`、`pageSize`、`platform?`、`industry?`、`keyword?`、`sort?`
- **响应体**（`data`）：分页结构

### 5.2 GET /templates/favorites

我的收藏列表（按 `Favorite.createdAt` 倒序，分页）。

- **鉴权**：JWT Bearer
- **Query**：`page`、`pageSize`
- **响应体**（`data`）：分页结构

### 5.3 GET /templates/:id

模板详情（公开）。

- **鉴权**：公开
- **响应体**（`data`）：模板实体

### 5.4 POST /templates/:id/favorite

收藏模板（幂等）。

- **鉴权**：JWT Bearer
- **响应体**（`data`）：`{ favorited: true, templateId }`

### 5.5 DELETE /templates/:id/favorite

取消收藏（幂等）。

- **鉴权**：JWT Bearer
- **响应体**（`data`）：`{ favorited: false, templateId }`

### 5.6 GET /users/industry-preferences

获取当前用户的行业偏好。

- **鉴权**：JWT Bearer
- **响应体**（`data`）：`{ industries: string[] }`

可选行业列表：`好物种草`、`本地生活`、`教育培训`、`IP 口播`、`老乡情怀`、`人设`、`卖货`、`破播`、`种草`、`数码`、`美妆`、`服饰`、`美食`、`旅游`、`健身`、`母婴`、`宠物`、`家居`、`汽车`、`金融`。

### 5.7 POST /users/industry-preferences

设置行业偏好（覆盖更新，1-3 个标签）。

- **鉴权**：JWT Bearer
- **请求体**：`{ industries: string[] }`（长度 1-3）
- **响应体**（`data`）：`{ industries: string[] }`

---

## 6. Billing Service（积分计费服务）

> 端口：3006 ｜ 路由前缀：`/api/v1/points`
>
> 职责：积分余额查询、流水查询、积分冻结/结算/释放/赠送（内部 API）。
> Swagger tag：`billing`
>
> 外部 API（小程序调用）：`balance`、`transactions`
> 内部 API（微服务调用，`x-api-key` 鉴权）：`freeze`、`settle`、`release`、`grant`

### 6.1 GET /points/balance

当前积分余额（可用 / 冻结 / 累计）。

- **鉴权**：JWT Bearer
- **响应体**（`data`）：

```json
{
  "available": 1200,
  "frozen": 100,
  "total": 3000
}
```

### 6.2 GET /points/transactions

积分流水（分页 + 筛选）。

- **鉴权**：JWT Bearer
- **Query**：`page`、`pageSize`、`type?`、`startTime?`、`endTime?`
- **响应体**（`data`）：分页结构

### 6.3 GET /points/transactions/:id

单笔流水详情。

- **鉴权**：JWT Bearer
- **响应体**（`data`）：流水实体

### 6.4 POST /points/freeze `[内部 API]`

冻结积分（任务提交时由 workbench-service 调用）。

- **鉴权**：`x-api-key` Header（配合 `@Public` 跳过 JWT）
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| userId | string | 是 | 用户 ID |
| amount | number | 是 | 冻结数量（>0） |
| idempotencyKey | string | 是 | 幂等键（≤128 字符） |
| workId | string | 否 | 关联作品 ID |
| description | string | 否 | 业务说明（≤256 字符） |

- **响应体**（`data`）：`{ freezeId, status: "FROZEN" }`
- **失败**：余额不足返回 `INSUFFICIENT_CREDITS (4001)`

### 6.5 POST /points/settle `[内部 API]`

结算冻结积分（任务成功后调用）。

- **鉴权**：`x-api-key`
- **请求体**：`{ freezeId, idempotencyKey, actualAmount?, description? }`
- **响应体**（`data`）：`{ status: "SETTLED" }`

### 6.6 POST /points/release `[内部 API]`

释放冻结积分（任务失败/取消时调用）。

- **鉴权**：`x-api-key`
- **请求体**：`{ freezeId, idempotencyKey, reason? }`
- **响应体**（`data`）：`{ status: "RELEASED" }`

### 6.7 POST /points/grant `[内部 API]`

赠送积分（套餐购买支付成功后由 order-service 调用）。

- **鉴权**：`x-api-key`
- **请求体**：`{ userId, amount, idempotencyKey, orderId?, description? }`
- **响应体**（`data`）：`{ grantId, status: "GRANTED" }`

---

## 7. Workbench Service（创作工作台服务）

> 端口：3007 ｜ 路由前缀：`/api/v1/generations`、`/api/v1/works`
>
> 职责：AI 生成任务（文生视频/图生视频/3D 建模/编辑视频/延长视频/文本生成/图片生成）提交与查询、作品管理。
> Swagger tag：`workbench`

### 7.1 POST /generations

提交生成任务。

- **鉴权**：JWT Bearer
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| generationType | string | 是 | 生成类型（见下方枚举） |
| prompt | string | 是 | 提示词（≤2000 字符） |
| model | string | 否 | 模型 ID（默认 `seedance2-pro`） |
| resolution | string | 否 | 分辨率：`480p` / `720p` / `1080p` |
| aspectRatio | string | 否 | 宽高比：`9:16` / `16:9` / `1:1` |
| duration | number | 否 | 时长（秒）：`5` 或 `10` |
| referenceImages | string[] | 否 | 参考图 asset key 数组 |
| referenceVideo | string | 否 | 参考视频 asset key |
| referenceAudio | string | 否 | 参考音频 asset key |
| firstFrame | string | 否 | 首帧图 asset key |
| lastFrame | string | 否 | 尾帧图 asset key |
| idempotencyKey | string | 否 | 幂等键（≤128 字符） |

- **generationType 枚举**：
  - `TEXT_TO_VIDEO` 文生视频
  - `IMAGE_TO_VIDEO_FIRST` 图生视频（首帧）
  - `IMAGE_TO_VIDEO_FIRST_LAST` 图生视频（首尾帧）
  - `3D_MODELING` 3D 建模
  - `EDIT_VIDEO` 编辑视频
  - `EXTEND_VIDEO` 延长视频
  - `TEXT_GENERATE` 文本生成
  - `IMAGE_GENERATE` 图片生成

- **业务流程**：计算消耗积分 → 调用 billing-service 冻结积分 → 创建 Work + GenerationTask → 启动 Temporal 工作流
- **响应体**（`data`）：`{ workId, taskId, status: "PENDING", estimatedPoints }`

### 7.2 GET /generations

任务列表（分页 + 筛选）。

- **鉴权**：JWT Bearer
- **Query**：`page`、`pageSize`、`status?`、`generationType?`
- **响应体**（`data`）：分页结构

### 7.3 GET /generations/:id

任务详情。

- **鉴权**：JWT Bearer
- **响应体**（`data`）：任务实体

### 7.4 POST /generations/:id/cancel

取消任务。

- **鉴权**：JWT Bearer
- **响应体**（`data`）：`{ cancelled: true, taskId }`

### 7.5 POST /generations/:id/retry

重试任务。

- **鉴权**：JWT Bearer
- **响应体**（`data`）：`{ taskId, status: "PENDING" }`

### 7.6 GET /works

作品列表（分页 + 筛选）。

- **鉴权**：JWT Bearer
- **Query**：`page`、`pageSize`、`generationType?`、`status?`
- **响应体**（`data`）：分页结构

### 7.7 GET /works/:id

作品详情（校验所有权）。

- **鉴权**：JWT Bearer
- **响应体**（`data`）：作品实体（含 OSS 访问 URL）

### 7.8 DELETE /works/:id

删除作品（软删除：`status=DELETED`，保留 OSS 文件 30 天）。

- **鉴权**：JWT Bearer
- **响应体**（`data`）：`{ deleted: true, workId }`

---

## 8. Notification Service（通知服务）

> 端口：3008 ｜ 路由前缀：`/api/v1/notifications`
>
> 职责：站内通知查询、未读计数、标记已读；WebSocket 实时推送（`ws://localhost:3008`）；微信订阅消息。
> Swagger tag：`notification`

### 8.1 GET /notifications

通知列表（分页 + 筛选）。

- **鉴权**：JWT Bearer
- **Query**：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页条数，默认 20，最大 100 |
| type | string | 否 | 通知类型筛选（SYSTEM/WORK/BILLING/...） |
| isRead | boolean | 否 | 按已读状态筛选 |

- **响应体**（`data`）：分页结构

### 8.2 GET /notifications/unread-count

未读数量。

- **鉴权**：JWT Bearer
- **响应体**（`data`）：`{ count: number }`

### 8.3 POST /notifications/read-all

全部标记已读。

- **鉴权**：JWT Bearer
- **响应体**（`data`）：`{ affected: number }`

### 8.4 POST /notifications/:id/read

标记单条已读。

- **鉴权**：JWT Bearer
- **响应体**（`data`）：`{ success: true }`

### 8.5 WebSocket（补充）

- **端点**：`ws://localhost:3008`（带 `?token=<accessToken>` 鉴权）
- **事件**：服务端推送 `notification:new`、`notification:read`
- **用途**：作品生成完成、积分变动等场景的实时通知

---

## 9. Order Service（订单与支付服务）

> 端口：3009 ｜ 路由前缀：`/api/v1/orders`、`/api/v1/packages`、`/api/v1/webhooks/wechat-pay`
>
> 职责：套餐查询、订单创建/查询/取消、微信支付下单与回调处理。
> Swagger tag：`order`、`package`、`webhook`

### 9.1 GET /packages

套餐列表（公开，按 sort、price 升序）。

- **鉴权**：公开
- **响应体**（`data`）：套餐数组

```json
[
  {
    "id": "01HZX...",
    "name": "体验套餐",
    "price": 9.9,
    "points": 100,
    "sort": 1,
    "isActive": true
  }
]
```

### 9.2 GET /packages/:id

套餐详情（公开）。

- **鉴权**：公开
- **响应体**（`data`）：套餐实体

### 9.3 POST /orders

创建订单。

- **鉴权**：JWT Bearer
- **请求体**：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| packageId | string | 是 | 套餐 ID |
| idempotencyKey | string | 否 | 幂等键（未提供时服务端生成，≤128 字符） |

- **响应体**（`data`）：

```json
{
  "orderId": "01HZX...",
  "orderNo": "RC202607290001",
  "paymentParams": {
    "appId": "wx...",
    "timeStamp": "1722230400",
    "nonceStr": "...",
    "package": "prepay_id=...",
    "signType": "RSA",
    "paySign": "..."
  }
}
```

### 9.4 GET /orders

订单列表（分页 + 状态筛选）。

- **鉴权**：JWT Bearer
- **Query**：`page`、`pageSize`、`status?`
- **响应体**（`data`）：分页结构

### 9.5 GET /orders/:id

订单详情（校验所有权）。

- **鉴权**：JWT Bearer
- **响应体**（`data`）：订单实体

### 9.6 POST /orders/:id/cancel

取消订单（仅 PENDING 状态可取消）。

- **鉴权**：JWT Bearer
- **响应体**（`data`）：`{ status: "CANCELLED", orderId }`

### 9.7 POST /webhooks/wechat-pay `[内部 API]`

微信支付回调（由微信服务器调用，非业务内部 API）。

- **鉴权**：公开（由微信签名校验保证可信）
- **请求头**：`Wechatpay-Serial`、`Wechatpay-Timestamp`、`Wechatpay-Nonce`、`Wechatpay-Signature`
- **请求体**：微信加密的回调报文
- **响应体**：

```json
{ "code": "SUCCESS", "message": "OK" }
```

> 始终返回 200 + `{ code: 'SUCCESS' }`，避免微信重试（订单不存在或已处理也不抛错）。

---

## 附录 A. 统一响应格式

所有 HTTP 接口（除微信回调外）的成功响应统一包装为：

```json
{
  "code": 0,
  "message": "success",
  "data": { /* 业务数据 */ },
  "traceId": "01HZX..."
}
```

分页响应的 `data` 结构为：

```json
{
  "list": [],
  "page": 1,
  "pageSize": 20,
  "total": 100
}
```

错误响应：

```json
{
  "code": 4001,
  "message": "积分余额不足",
  "data": null,
  "traceId": "01HZX..."
}
```

---

## 附录 B. 错误码表

| code | 含义 | HTTP 状态 |
| --- | --- | --- |
| 0 | 成功 | 200 |
| 1000 | 参数校验失败 | 400 |
| 1001 | 资源不存在 | 404 |
| 1002 | 资源已存在 | 409 |
| 1003 | 操作不允许（状态冲突） | 409 |
| 2001 | 未登录 | 401 |
| 2002 | Token 无效或已过期 | 401 |
| 2003 | 权限不足 | 403 |
| 3001 | 内部 API Key 缺失或无效 | 401 |
| 4001 | 积分余额不足 | 400 |
| 4002 | 积分冻结记录不存在 | 404 |
| 4003 | 积分冻结记录状态不允许操作 | 409 |
| 5000 | 限流（触发 RateLimit） | 429 |
| 9000 | 内部错误 | 500 |
| 9001 | 第三方服务异常 | 502 |

完整定义见 `libs/common/src/enums/error-code.enum.ts`。

---

## 附录 C. 分页查询约定

所有分页接口遵循以下约定：

- **Query 参数**：`page`（页码，1 基，默认 1）、`pageSize`（每页条数，默认 20，最大 100）
- **响应结构**：`data: { list: T[], page: number, pageSize: number, total: number }`
- **排序**：列表接口默认按 `createdAt DESC`，特殊排序由 `sort` 参数指定（如 `heat`、`latest`、`iq`）
- **筛选**：可选 Query 参数对应实体的字段名，未传则不筛选

---

## Swagger UI 访问

启动任一微服务后，浏览器访问：

| 服务 | Swagger UI |
| --- | --- |
| auth-service | http://localhost:3001/api/docs |
| user-service | http://localhost:3002/api/docs |
| asset-service | http://localhost:3003/api/docs |
| benchmark-service | http://localhost:3004/api/docs |
| template-service | http://localhost:3005/api/docs |
| billing-service | http://localhost:3006/api/docs |
| workbench-service | http://localhost:3007/api/docs |
| notification-service | http://localhost:3008/api/docs |
| order-service | http://localhost:3009/api/docs |

> 各微服务的 `main.ts` 引入 `@reelclone/swagger` 的 `createSwaggerConfig` + `setupSwagger` 即可挂载。
