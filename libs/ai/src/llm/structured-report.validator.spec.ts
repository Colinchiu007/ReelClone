/**
 * StructuredReport 校验器单元测试（B4 — LLM 输出 Schema 校验）
 *
 * 覆盖场景：
 *  1. 完全有效的输入 → valid=true，所有字段保留
 *  2. 根节点非对象 → valid=false
 *  3. 顶层字符串字段缺失/空串 → 走兜底，errors 记录
 *  4. shotList 非数组 / 元素非对象 / 字段类型错误 → 字段级兜底
 *  5. copywriting 部分子字段缺失 → 整体视为无效（与原 `??` 行为对齐）
 *  6. sellingPoints 含非字符串元素 → 过滤无效元素
 *  7. 空对象输入 → 所有字段走兜底
 *  8. 数组/字符串/null 作为根节点 → valid=false
 */
import { validateLlmStructuredReport } from './structured-report.validator'

/** 构造完全有效的 LLM 原始输出 */
function buildValidRaw(): Record<string, unknown> {
  return {
    style: '快节奏带货种草风',
    pacing: '15 秒短视频，4 个场景',
    shotList: [
      {
        sceneIndex: 0,
        duration: 3.5,
        visual: '开场产品展示',
        voiceover: '这是一款超好用的产品',
        onScreenText: '爆款推荐',
      },
      {
        sceneIndex: 1,
        duration: 4.7,
        visual: '使用场景演示',
        voiceover: '今天给大家推荐',
        onScreenText: '限时特价',
      },
    ],
    copywriting: {
      hook: '这是一款超好用的产品',
      body: '今天给大家推荐',
      cta: '赶紧下单吧！',
    },
    sellingPoints: ['高颜值', '易操作', '性价比'],
    templateSuggestion: '建议复用「痛点 hook + 演示 + CTA」结构',
  }
}

describe('validateLlmStructuredReport', () => {
  // -------------------- 1. 完全有效输入 --------------------
  it('完全有效的输入：应返回 valid=true 且保留所有字段', () => {
    const raw = buildValidRaw()
    const { valid, report, errors } = validateLlmStructuredReport(raw)

    expect(valid).toBe(true)
    expect(errors).toHaveLength(0)
    expect(report.style).toBe('快节奏带货种草风')
    expect(report.pacing).toBe('15 秒短视频，4 个场景')
    expect(report.templateSuggestion).toContain('建议复用')
    expect(report.shotList).toHaveLength(2)
    expect(report.shotList?.[0].sceneIndex).toBe(0)
    expect(report.shotList?.[1].visual).toBe('使用场景演示')
    expect(report.copywriting?.hook).toBe('这是一款超好用的产品')
    expect(report.copywriting?.cta).toBe('赶紧下单吧！')
    expect(report.sellingPoints).toEqual(['高颜值', '易操作', '性价比'])
  })

  // -------------------- 2. 根节点非对象 --------------------
  it.each([
    ['null', null],
    ['数组', [1, 2, 3]],
    ['字符串', 'not an object'],
    ['数字', 42],
    ['undefined', undefined],
  ])('根节点为 %s 时：应返回 valid=false 且 report 为空对象', (_label, input) => {
    const { valid, report, errors } = validateLlmStructuredReport(input)

    expect(valid).toBe(false)
    expect(report).toEqual({})
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBe('根节点不是对象')
  })

  // -------------------- 3. 顶层字符串字段缺失/空串 --------------------
  it('style/pacing/templateSuggestion 缺失或空串：应记录错误且不写入 report', () => {
    const raw = {
      ...buildValidRaw(),
      style: '',
      pacing: '   ',
      templateSuggestion: undefined,
    }
    const { valid, report, errors } = validateLlmStructuredReport(raw)

    expect(valid).toBe(false)
    expect(report.style).toBeUndefined()
    expect(report.pacing).toBeUndefined()
    expect(report.templateSuggestion).toBeUndefined()
    expect(errors).toContain('style: 无效（非字符串或空）')
    expect(errors).toContain('pacing: 无效（非字符串或空）')
    expect(errors).toContain('templateSuggestion: 无效（非字符串或空）')
    // 其他字段应保留
    expect(report.shotList).toHaveLength(2)
    expect(report.copywriting?.hook).toBe('这是一款超好用的产品')
  })

  // -------------------- 4. shotList 异常 --------------------
  it('shotList 非数组：应记录错误且 shotList 为 undefined', () => {
    const raw = { ...buildValidRaw(), shotList: 'not an array' }
    const { valid, report, errors } = validateLlmStructuredReport(raw)

    expect(valid).toBe(false)
    expect(report.shotList).toBeUndefined()
    expect(errors).toContain('shotList: 不是数组')
  })

  it('shotList 元素非对象：应兜底为空字段并记录错误', () => {
    const raw = {
      ...buildValidRaw(),
      shotList: ['invalid', 42, null],
    }
    const { valid, report, errors } = validateLlmStructuredReport(raw)

    expect(valid).toBe(false)
    expect(report.shotList).toHaveLength(3)
    // 非对象元素兜底为 idx 作为 sceneIndex，其他字段为空
    expect(report.shotList?.[0]).toEqual({
      sceneIndex: 0,
      duration: 0,
      visual: '',
      voiceover: '',
      onScreenText: '',
    })
    expect(errors.some((e) => e.startsWith('shotList[0]: 不是对象'))).toBe(true)
    expect(errors.some((e) => e.startsWith('shotList[1]: 不是对象'))).toBe(true)
    expect(errors.some((e) => e.startsWith('shotList[2]: 不是对象'))).toBe(true)
  })

  it('shotList 元素字段类型错误：应兜底为默认值', () => {
    const raw = {
      ...buildValidRaw(),
      shotList: [
        {
          sceneIndex: 'zero', // 非数字 → 兜底为 idx=0
          duration: '3.5', // 非数字 → 兜底为 0
          visual: 123, // 非字符串 → 兜底为 ''
          voiceover: null, // 非字符串 → 兜底为 ''
          onScreenText: '', // 空串 → 兜底为 ''
        },
      ],
    }
    const { valid, report, errors } = validateLlmStructuredReport(raw)

    expect(valid).toBe(false)
    expect(report.shotList?.[0].sceneIndex).toBe(0) // 兜底为 idx
    expect(report.shotList?.[0].duration).toBe(0)
    expect(report.shotList?.[0].visual).toBe('')
    expect(report.shotList?.[0].voiceover).toBe('')
    expect(report.shotList?.[0].onScreenText).toBe('')
    // 应记录 5 个字段级错误
    expect(errors.filter((e) => e.startsWith('shotList[0].'))).toHaveLength(5)
  })

  // -------------------- 5. copywriting 部分子字段缺失 --------------------
  it('copywriting 缺 hook：应视为整体无效（与原 ?? 行为对齐）', () => {
    const raw = {
      ...buildValidRaw(),
      copywriting: {
        body: '今天给大家推荐',
        cta: '赶紧下单吧！',
        // hook 缺失
      },
    }
    const { valid, report, errors } = validateLlmStructuredReport(raw)

    expect(valid).toBe(false)
    // copywriting 整体不写入 report（与原 `??` 行为一致，避免部分子字段数据不完整）
    expect(report.copywriting).toBeUndefined()
    expect(errors).toContain('copywriting.hook: 无效')
  })

  it('copywriting 非对象：应记录错误且 copywriting 为 undefined', () => {
    const raw = { ...buildValidRaw(), copywriting: 'invalid' }
    const { valid, report, errors } = validateLlmStructuredReport(raw)

    expect(valid).toBe(false)
    expect(report.copywriting).toBeUndefined()
    expect(errors).toContain('copywriting: 不是对象')
  })

  // -------------------- 6. sellingPoints 含非字符串元素 --------------------
  it('sellingPoints 含非字符串元素：应过滤无效元素', () => {
    const raw = {
      ...buildValidRaw(),
      sellingPoints: ['高颜值', 123, null, '性价比', '', undefined, '易操作'],
    }
    const { valid, report, errors } = validateLlmStructuredReport(raw)

    expect(valid).toBe(false)
    // 仅保留有效字符串
    expect(report.sellingPoints).toEqual(['高颜值', '性价比', '易操作'])
    // 应记录元素级错误 + 部分过滤提示
    expect(errors.some((e) => e === 'sellingPoints: 部分元素已过滤')).toBe(true)
  })

  it('sellingPoints 非数组：应记录错误且为 undefined', () => {
    const raw = { ...buildValidRaw(), sellingPoints: '高颜值, 易操作' }
    const { valid, report, errors } = validateLlmStructuredReport(raw)

    expect(valid).toBe(false)
    expect(report.sellingPoints).toBeUndefined()
    expect(errors).toContain('sellingPoints: 不是数组')
  })

  // -------------------- 7. 空对象输入 --------------------
  it('空对象输入：所有字段走兜底，errors 记录所有无效字段', () => {
    const { valid, report, errors } = validateLlmStructuredReport({})

    expect(valid).toBe(false)
    expect(report).toEqual({})
    // 应记录 6 个顶层字段错误（style/pacing/templateSuggestion/shotList/copywriting/sellingPoints）
    expect(errors.length).toBeGreaterThanOrEqual(6)
    expect(errors).toContain('style: 无效（非字符串或空）')
    expect(errors).toContain('pacing: 无效（非字符串或空）')
    expect(errors).toContain('templateSuggestion: 无效（非字符串或空）')
    expect(errors).toContain('shotList: 不是数组')
    expect(errors).toContain('copywriting: 不是对象')
    expect(errors).toContain('sellingPoints: 不是数组')
  })

  // -------------------- 8. summaryMs 不参与校验 --------------------
  it('summaryMs 字段不影响校验结果（由 Activity 注入）', () => {
    const raw = {
      ...buildValidRaw(),
      summaryMs: 'should be ignored',
    }
    const { valid, report } = validateLlmStructuredReport(raw)

    // summaryMs 不在校验范围内，其他字段都有效 → valid=true
    expect(valid).toBe(true)
    // report 不应包含 summaryMs（validator 不处理该字段）
    expect((report as Record<string, unknown>).summaryMs).toBeUndefined()
  })

  // -------------------- 9. shotList 为空数组 --------------------
  it('shotList 为空数组：应视为有效（valid 部分），不记录错误', () => {
    const raw = { ...buildValidRaw(), shotList: [] }
    const { valid, report, errors } = validateLlmStructuredReport(raw)

    expect(valid).toBe(true)
    expect(report.shotList).toEqual([])
    expect(errors).toHaveLength(0)
  })
})
