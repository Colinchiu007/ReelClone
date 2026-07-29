/**
 * Pino 日志配置
 *
 * 按环境生成 LoggerOptions：
 *  - 开发环境：pretty print + colorize + level=debug
 *  - 生产环境：JSON 格式 + 结构化字段（service）+ level=info
 *
 * 日志轮转由外部管理（systemd journald 或 Docker 日志驱动）。
 */
import pino, { type LoggerOptions } from 'pino'

/** 服务名注入 Token（由 LoggerModule / HealthModule 提供） */
export const OBS_SERVICE_NAME = Symbol('OBS_SERVICE_NAME')

/** 日志级别注入 Token（由 LoggerModule 提供） */
export const OBS_LOG_LEVEL = Symbol('OBS_LOG_LEVEL')

export interface LoggerConfigOptions {
  /** 服务名，写入每条日志的 service 字段 */
  serviceName?: string
  /** 日志级别，覆盖环境默认值（dev=debug, prod=info） */
  level?: string
}

/**
 * 构建 Pino LoggerOptions
 *
 * @param options 配置项
 * @returns pino LoggerOptions
 */
export function createLoggerConfig(options: LoggerConfigOptions = {}): LoggerOptions {
  const isProduction = process.env.NODE_ENV === 'production'
  const serviceName = options.serviceName ?? process.env.SERVICE_NAME ?? 'unknown'
  const level = options.level ?? (isProduction ? 'info' : 'debug')

  // 结构化字段格式化器：为每条日志注入 service 字段
  const formatters = {
    level: (label: string) => ({ level: label }),
    log: (object: Record<string, unknown>) => ({
      service: serviceName,
      ...object,
    }),
  }

  if (isProduction) {
    // 生产环境：JSON 格式
    return {
      level,
      formatters,
      timestamp: pino.stdTimeFunctions.isoTime,
    }
  }

  // 开发环境：pretty print + colorize
  return {
    level,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    },
    formatters,
    timestamp: pino.stdTimeFunctions.isoTime,
  }
}
