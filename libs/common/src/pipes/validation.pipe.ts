/**
 * 验证 Pipe 工厂
 *
 * 基于 NestJS 内置 ValidationPipe + class-validator / class-transformer，
 * 提供预配置的验证选项，确保全项目统一的参数校验行为。
 *
 * 默认行为：
 *  - whitelist: true         去除 DTO 中未定义的属性
 *  - forbidNonWhitelisted: true  存在未定义属性时抛出异常
 *  - transform: true         自动类型转换（字符串 → DTO 类型）
 *  - enableImplicitConversion: true  隐式类型转换
 *
 * 全局注册：
 * ```ts
 * app.useGlobalPipes(createValidationPipe())
 * ```
 */
import { type ValidationPipeOptions, ValidationPipe } from '@nestjs/common'

/**
 * 默认验证选项
 */
export const defaultValidationOptions: ValidationPipeOptions = {
  /** 去除 DTO 中未定义的属性 */
  whitelist: true,
  /** 存在未定义属性时抛出异常 */
  forbidNonWhitelisted: true,
  /** 自动类型转换 */
  transform: true,
  /** 隐式类型转换 */
  transformOptions: {
    enableImplicitConversion: true,
  },
  /** 收集所有校验错误而非首个即返回 */
  stopAtFirstError: false,
}

/**
 * 创建验证 Pipe 的工厂函数
 *
 * @param options 自定义选项，会与默认选项合并（浅合并，transformOptions 为深合并）
 * @returns 配置好的 ValidationPipe 实例
 */
export function createValidationPipe(options?: ValidationPipeOptions): ValidationPipe {
  const mergedOptions: ValidationPipeOptions = {
    ...defaultValidationOptions,
    ...options,
    transformOptions: {
      ...defaultValidationOptions.transformOptions,
      ...options?.transformOptions,
    },
  }
  return new ValidationPipe(mergedOptions)
}

/**
 * 预配置的验证 Pipe 实例（可直接使用）
 */
export const AppValidationPipe = createValidationPipe()
