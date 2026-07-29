/**
 * 日期时间工具（基于 dayjs 封装）
 *
 * 统一时区为 Asia/Shanghai，提供格式化、解析、比较等常用操作。
 */
import dayjs, { type Dayjs, type ManipulateType } from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import customParseFormat from 'dayjs/plugin/customParseFormat'

// 注册 dayjs 插件
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)

/** 默认时区：东八区 */
export const DEFAULT_TIMEZONE = 'Asia/Shanghai'

/** 默认日期时间格式 */
export const DATETIME_FORMAT = 'YYYY-MM-DD HH:mm:ss'

/** 默认日期格式 */
export const DATE_FORMAT = 'YYYY-MM-DD'

/**
 * 获取当前时间的 Dayjs 对象
 */
export function now(): Dayjs {
  return dayjs()
}

/**
 * 获取当前时间戳（秒）
 */
export function currentTimestamp(): number {
  return dayjs().unix()
}

/**
 * 格式化日期
 * @param date 日期值（Date / 字符串 / 时间戳）
 * @param format 格式模板，默认 `YYYY-MM-DD HH:mm:ss`
 * @returns 格式化后的字符串
 */
export function formatDate(
  date: Date | string | number,
  format: string = DATETIME_FORMAT,
): string {
  return dayjs(date).format(format)
}

/**
 * 格式化为 ISO 8601 字符串（UTC）
 */
export function toISOString(date: Date | string | number): string {
  return dayjs(date).toISOString()
}

/**
 * 转换到指定时区的 Dayjs 对象
 * @param date 日期值
 * @param tz 时区，默认 Asia/Shanghai
 */
export function toTimezone(date: Date | string | number, tz: string = DEFAULT_TIMEZONE): Dayjs {
  return dayjs(date).tz(tz)
}

/**
 * 按指定格式解析日期字符串
 * @param dateStr 日期字符串
 * @param format 格式模板（可选）
 */
export function parseDate(dateStr: string, format?: string): Dayjs {
  return format ? dayjs(dateStr, format) : dayjs(dateStr)
}

/**
 * 计算两个时间点的差值（毫秒）
 */
export function diffMilliseconds(
  start: Date | string | number,
  end: Date | string | number,
): number {
  return dayjs(end).valueOf() - dayjs(start).valueOf()
}

/**
 * 计算两个时间点的差值（秒）
 */
export function diffSeconds(start: Date | string | number, end: Date | string | number): number {
  return dayjs(end).unix() - dayjs(start).unix()
}

/**
 * 判断目标时间是否已过期
 * @param target 目标时间
 * @param from 对比基准，默认当前
 */
export function isExpired(target: Date | string | number, from: Date | string | number = Date.now()): boolean {
  return dayjs(target).valueOf() < dayjs(from).valueOf()
}

/**
 * 在指定时间上增加偏移量
 * @param date 基准时间
 * @param amount 偏移量
 * @param unit 单位（day / hour / minute / second 等）
 */
export function addTime(
  date: Date | string | number,
  amount: number,
  unit: ManipulateType,
): Dayjs {
  return dayjs(date).add(amount, unit)
}

export { dayjs }
export type { Dayjs }
