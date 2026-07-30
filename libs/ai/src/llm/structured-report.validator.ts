/**
 * StructuredReport 校验器（B4 — LLM 输出 Schema 校验）
 *
 * 职责：
 *  1. 校验 LLM 返回的 JSON 是否符合 StructuredReport 结构（不含 summaryMs）
 *  2. 字段级容错：无效字段走兜底，有效字段保留（替代原 `??` 全量替换逻辑）
 *  3. 子结构校验：shotList 元素 / copywriting 子字段 / sellingPoints 元素类型
 *
 * 设计决策：
 *  - 纯 TS 类型守卫实现，不引入 class-validator 依赖（libs/ai 无该依赖）
 *  - summaryMs 由 Activity 注入，不参与 LLM 输出校验
 *  - 空字符串视为无效（原 `??` 不会兜底空串，可能传给下游导致显示异常）
 *
 * 与原 `??` 链的区别：
 *  - 原：copywriting 缺 hook → 整个 copywriting 对象被替换，丢失 body/cta
 *  - 新：copywriting 缺 hook → 仅 hook 走兜底，body/cta 保留
 *  - 原：shotList[i] 缺 visual → visual 为 undefined 传给下游
 *  - 新：shotList[i] 缺 visual → visual 兜底为空字符串
 */
import type { StructuredReport } from './prompt-engine.service'

/** 校验结果 */
export interface ValidationResult {
  /** 是否所有字段都有效 */
  valid: boolean
  /** 校验出的部分报告（仅包含有效字段，无效字段不出现） */
  report: Partial<StructuredReport>
  /** 校验错误列表（每条对应一个无效字段） */
  errors: string[]
}

/** 类型守卫：非空字符串 */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

/** 类型守卫：有限数字 */
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** 类型守卫：普通对象（非 null/数组） */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * 校验 shotList 数组元素
 *
 * @returns 校验后的 shotList（每个元素的无效字段已兜底为空字符串/0）
 */
function validateShotList(
  raw: unknown,
  errors: string[],
  pathPrefix: string,
): StructuredReport['shotList'] | undefined {
  if (!Array.isArray(raw)) {
    errors.push(`${pathPrefix}: 不是数组`)
    return undefined
  }

  const result: StructuredReport['shotList'] = []
  raw.forEach((item, idx) => {
    const path = `${pathPrefix}[${idx}]`
    if (!isPlainObject(item)) {
      errors.push(`${path}: 不是对象`)
      result.push({
        sceneIndex: idx,
        duration: 0,
        visual: '',
        voiceover: '',
        onScreenText: '',
      })
      return
    }

    result.push({
      sceneIndex: isFiniteNumber(item.sceneIndex) ? item.sceneIndex : idx,
      duration: isFiniteNumber(item.duration) ? item.duration : 0,
      visual: isNonEmptyString(item.visual) ? item.visual : '',
      voiceover: isNonEmptyString(item.voiceover) ? item.voiceover : '',
      onScreenText: isNonEmptyString(item.onScreenText) ? item.onScreenText : '',
    })

    // 记录无效字段（用于日志诊断，不阻塞流程）
    if (!isFiniteNumber(item.sceneIndex)) errors.push(`${path}.sceneIndex: 无效`)
    if (!isFiniteNumber(item.duration)) errors.push(`${path}.duration: 无效`)
    if (!isNonEmptyString(item.visual)) errors.push(`${path}.visual: 无效`)
    if (!isNonEmptyString(item.voiceover)) errors.push(`${path}.voiceover: 无效`)
    if (!isNonEmptyString(item.onScreenText)) errors.push(`${path}.onScreenText: 无效`)
  })

  return result
}

/**
 * 校验 copywriting 子结构
 *
 * 字段级容错：缺 hook 仅 hook 兜底，body/cta 保留
 */
function validateCopywriting(
  raw: unknown,
  errors: string[],
  pathPrefix: string,
): StructuredReport['copywriting'] | undefined {
  if (!isPlainObject(raw)) {
    errors.push(`${pathPrefix}: 不是对象`)
    return undefined
  }

  // 任一字段无效则视为整体无效（与原 `??` 行为对齐，避免部分子字段缺失时数据不完整）
  // 但保留有效字段用于下游兜底
  const hook = isNonEmptyString(raw.hook) ? raw.hook : null
  const body = isNonEmptyString(raw.body) ? raw.body : null
  const cta = isNonEmptyString(raw.cta) ? raw.cta : null

  if (hook === null) errors.push(`${pathPrefix}.hook: 无效`)
  if (body === null) errors.push(`${pathPrefix}.body: 无效`)
  if (cta === null) errors.push(`${pathPrefix}.cta: 无效`)

  // 三个字段都有效才返回完整对象
  if (hook !== null && body !== null && cta !== null) {
    return { hook, body, cta }
  }

  return undefined
}

/**
 * 校验 sellingPoints（字符串数组，过滤非字符串）
 */
function validateSellingPoints(
  raw: unknown,
  errors: string[],
  pathPrefix: string,
): string[] | undefined {
  if (!Array.isArray(raw)) {
    errors.push(`${pathPrefix}: 不是数组`)
    return undefined
  }

  const result: string[] = []
  let hasInvalid = false
  raw.forEach((item, idx) => {
    if (isNonEmptyString(item)) {
      result.push(item)
    } else {
      hasInvalid = true
      errors.push(`${pathPrefix}[${idx}]: 非字符串或空`)
    }
  })

  // 数组本身有效（即便过滤后为空也保留），仅记录元素级错误
  if (hasInvalid) {
    errors.push(`${pathPrefix}: 部分元素已过滤`)
  }
  return result
}

/**
 * 校验 LLM 返回的原始 JSON 结构（不含 summaryMs）
 *
 * @param raw LLM 返回的 JSON.parse 结果
 * @returns 校验结果：valid / 部分报告 / 错误列表
 */
export function validateLlmStructuredReport(raw: unknown): ValidationResult {
  const errors: string[] = []
  const report: Partial<StructuredReport> = {}

  if (!isPlainObject(raw)) {
    return {
      valid: false,
      report: {},
      errors: ['根节点不是对象'],
    }
  }

  // 顶层字符串字段
  if (isNonEmptyString(raw.style)) {
    report.style = raw.style
  } else {
    errors.push('style: 无效（非字符串或空）')
  }

  if (isNonEmptyString(raw.pacing)) {
    report.pacing = raw.pacing
  } else {
    errors.push('pacing: 无效（非字符串或空）')
  }

  if (isNonEmptyString(raw.templateSuggestion)) {
    report.templateSuggestion = raw.templateSuggestion
  } else {
    errors.push('templateSuggestion: 无效（非字符串或空）')
  }

  // 子结构字段
  const shotList = validateShotList(raw.shotList, errors, 'shotList')
  if (shotList !== undefined) {
    report.shotList = shotList
  }

  const copywriting = validateCopywriting(raw.copywriting, errors, 'copywriting')
  if (copywriting !== undefined) {
    report.copywriting = copywriting
  }

  const sellingPoints = validateSellingPoints(raw.sellingPoints, errors, 'sellingPoints')
  if (sellingPoints !== undefined) {
    report.sellingPoints = sellingPoints
  }

  return {
    valid: errors.length === 0,
    report,
    errors,
  }
}
