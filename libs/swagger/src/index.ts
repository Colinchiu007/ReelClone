/**
 * @reelclone/swagger — ReelClone Swagger/OpenAPI 共享配置库入口
 *
 * 统一导出：
 *  - SwaggerModuleConfig: 动态模块，封装 DocumentBuilder + SwaggerModule.setup
 *  - createSwaggerConfig: 配置工厂函数
 *  - ApiPaginatedResponse: 分页响应装饰器
 *  - ApiInternal: 内部 API 装饰器（标记为不对外公开）
 *  - ApiOkResponseWithWrapper: 统一响应包装装饰器
 *
 * 所有业务微服务通过 `@reelclone/swagger` 引入，保证 OpenAPI 文档一致。
 */

// -------------------- 模块 --------------------
export * from './swagger.module'

// -------------------- 配置工厂 --------------------
export * from './swagger.config'

// -------------------- 装饰器 --------------------
export * from './decorators/api-paginated.decorator'
export * from './decorators/api-internal.decorator'
