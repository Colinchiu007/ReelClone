/**
 * LoggerService — Pino 日志服务封装
 *
 * 提供 info / warn / error / debug 四个级别方法，
 * 每个方法接受消息字符串与可选的结构化上下文对象。
 *
 * 通过 DI 注入 OBS_SERVICE_NAME（服务名）和 OBS_LOG_LEVEL（日志级别），
 * 均为可选注入——未提供时使用 logger.config 中的环境默认值。
 */
import { Inject, Injectable, Optional } from '@nestjs/common'
import pino, { type Logger } from 'pino'
import {
  OBS_LOG_LEVEL,
  OBS_SERVICE_NAME,
  createLoggerConfig,
} from './logger.config'

@Injectable()
export class LoggerService {
  private readonly logger: Logger

  constructor(
    @Optional() @Inject(OBS_SERVICE_NAME) context?: string,
    @Optional() @Inject(OBS_LOG_LEVEL) level?: string,
  ) {
    this.logger = pino(createLoggerConfig({ serviceName: context, level }))
  }

  /** INFO 级别日志 */
  info(msg: string, context?: Record<string, unknown>): void {
    this.logger.info(context ?? {}, msg)
  }

  /** WARN 级别日志 */
  warn(msg: string, context?: Record<string, unknown>): void {
    this.logger.warn(context ?? {}, msg)
  }

  /**
   * ERROR 级别日志
   * @param msg 消息
   * @param error 可选的 Error 对象（自动提取 message / stack / name）
   * @param context 可选的结构化上下文
   */
  error(msg: string, error?: Error, context?: Record<string, unknown>): void {
    const merged: Record<string, unknown> = { ...context }
    if (error) {
      merged.err = {
        message: error.message,
        stack: error.stack,
        name: error.name,
      }
    }
    this.logger.error(merged, msg)
  }

  /** DEBUG 级别日志 */
  debug(msg: string, context?: Record<string, unknown>): void {
    this.logger.debug(context ?? {}, msg)
  }

  /** 获取底层 pino Logger（高级用法） */
  getPinoLogger(): Logger {
    return this.logger
  }
}
