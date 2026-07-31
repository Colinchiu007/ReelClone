/**
 * @jest-environment jsdom
 *
 * TemplateCard 组件单元测试
 *
 * 覆盖场景：
 *  - 渲染基础字段（title / coverUrl / platform / playCount / iqScore）
 *  - 无 coverUrl 时显示"模板"占位符
 *  - 无 platform 时不渲染平台标签
 *  - formatPlay 边界值（0 / 负数 / 万 / 亿）
 *  - 收藏按钮：未收藏 ♡ / 已收藏 ♥
 *  - 点击收藏按钮触发 onFavorite(id, next) + stopPropagation
 *  - 点击卡片触发 onClick(id)
 *  - 上传者区域：无 author 不渲染 / 有 author 渲染
 *  - 上传者头像：有 authorAvatar 显示 img / 无显示首字母占位符
 *  - 上传者统计：有 authorUploadCount/authorUsedCount 显示 / 无则不显示
 *  - 点击上传者区域触发 onAuthorClick(authorId) + stopPropagation
 *  - 无 authorId 时点击上传者区域不触发回调
 *  - IQ：有 iqScore 显示 / 无则不显示
 */
import { render, fireClick } from '../../../test/render'
import TemplateCard, { type TemplateItem } from '../index'

/** 构造一个完整的 TemplateItem */
function buildTemplate(overrides: Partial<TemplateItem> = {}): TemplateItem {
  return {
    id: 'tpl-001',
    title: '测试模板标题',
    coverUrl: 'https://example.com/cover.jpg',
    platform: '抖音',
    author: '创作者A',
    authorId: 'user-001',
    authorAvatar: 'https://example.com/avatar.png',
    authorUploadCount: 12,
    authorUsedCount: 345,
    playCount: 12345,
    iqScore: 88,
    isFavorited: false,
    ...overrides,
  }
}

describe('TemplateCard', () => {
  describe('基础渲染', () => {
    it('渲染 title / coverUrl / platform / playCount / iqScore', () => {
      const tpl = buildTemplate()
      const { queryByText, queryByClass } = render(<TemplateCard template={tpl} />)

      expect(queryByText('测试模板标题')).not.toBeNull()
      expect(queryByText('抖音')).not.toBeNull()
      // formatPlay(12345) = '1.2万'
      expect(queryByText('▶ 1.2万')).not.toBeNull()
      expect(queryByText('88')).not.toBeNull()
      expect(queryByClass('template-card__image')).not.toBeNull()
    })

    it('无 coverUrl 时显示"模板"占位符', () => {
      const tpl = buildTemplate({ coverUrl: undefined })
      const { queryByText, queryByClass } = render(<TemplateCard template={tpl} />)

      expect(queryByText('模板')).not.toBeNull()
      expect(queryByClass('template-card__image')).toBeNull()
      expect(queryByClass('template-card__placeholder')).not.toBeNull()
    })

    it('无 platform 时不渲染平台标签', () => {
      const tpl = buildTemplate({ platform: undefined })
      const { queryByText } = render(<TemplateCard template={tpl} />)

      expect(queryByText('抖音')).toBeNull()
    })

    it('无 iqScore 时不渲染 IQ 区域', () => {
      const tpl = buildTemplate({ iqScore: undefined })
      const { queryByClass, queryByText } = render(<TemplateCard template={tpl} />)

      expect(queryByClass('template-card__iq')).toBeNull()
      expect(queryByText('IQ')).toBeNull()
    })

    it('有 iqScore 时渲染 IQ 标签和值', () => {
      const tpl = buildTemplate({ iqScore: 95 })
      const { queryByClass, queryByText } = render(<TemplateCard template={tpl} />)

      expect(queryByClass('template-card__iq')).not.toBeNull()
      expect(queryByText('IQ')).not.toBeNull()
      expect(queryByText('95')).not.toBeNull()
    })
  })

  describe('formatPlay 边界值', () => {
    it('playCount=0 时显示 ▶ 0', () => {
      const tpl = buildTemplate({ playCount: 0 })
      const { queryByText } = render(<TemplateCard template={tpl} />)
      expect(queryByText('▶ 0')).not.toBeNull()
    })

    it('playCount 为负数时显示 ▶ 0', () => {
      const tpl = buildTemplate({ playCount: -100 })
      const { queryByText } = render(<TemplateCard template={tpl} />)
      expect(queryByText('▶ 0')).not.toBeNull()
    })

    it('playCount=9999 时显示原数字', () => {
      const tpl = buildTemplate({ playCount: 9999 })
      const { queryByText } = render(<TemplateCard template={tpl} />)
      expect(queryByText('▶ 9999')).not.toBeNull()
    })

    it('playCount=10000 时显示 1.0万', () => {
      const tpl = buildTemplate({ playCount: 10000 })
      const { queryByText } = render(<TemplateCard template={tpl} />)
      expect(queryByText('▶ 1.0万')).not.toBeNull()
    })

    it('playCount=100000000 时显示 1.0亿', () => {
      const tpl = buildTemplate({ playCount: 100000000 })
      const { queryByText } = render(<TemplateCard template={tpl} />)
      expect(queryByText('▶ 1.0亿')).not.toBeNull()
    })

    it('playCount=undefined 时显示 ▶ 0', () => {
      const tpl = buildTemplate({ playCount: undefined })
      const { queryByText } = render(<TemplateCard template={tpl} />)
      expect(queryByText('▶ 0')).not.toBeNull()
    })
  })

  describe('收藏按钮', () => {
    it('未收藏时显示 ♡', () => {
      const tpl = buildTemplate({ isFavorited: false })
      const { queryByText } = render(<TemplateCard template={tpl} />)
      expect(queryByText('♡')).not.toBeNull()
    })

    it('已收藏时显示 ♥', () => {
      const tpl = buildTemplate({ isFavorited: true })
      const { queryByText } = render(<TemplateCard template={tpl} />)
      expect(queryByText('♥')).not.toBeNull()
    })

    it('点击收藏按钮触发 onFavorite(id, true)（未收藏 → 收藏）', () => {
      const tpl = buildTemplate({ isFavorited: false })
      const onFavorite = jest.fn()
      const { queryByText } = render(<TemplateCard template={tpl} onFavorite={onFavorite} />)

      fireClick(queryByText('♡')!)
      expect(onFavorite).toHaveBeenCalledWith('tpl-001', true)
    })

    it('点击收藏按钮触发 onFavorite(id, false)（已收藏 → 取消）', () => {
      const tpl = buildTemplate({ isFavorited: true })
      const onFavorite = jest.fn()
      const { queryByText } = render(<TemplateCard template={tpl} onFavorite={onFavorite} />)

      fireClick(queryByText('♥')!)
      expect(onFavorite).toHaveBeenCalledWith('tpl-001', false)
    })

    it('点击收藏按钮 stopPropagation 不触发 onClick', () => {
      const tpl = buildTemplate({ isFavorited: false })
      const onClick = jest.fn()
      const onFavorite = jest.fn()
      const { queryByText } = render(
        <TemplateCard template={tpl} onClick={onClick} onFavorite={onFavorite} />,
      )

      fireClick(queryByText('♡')!)
      expect(onFavorite).toHaveBeenCalledTimes(1)
      expect(onClick).not.toHaveBeenCalled()
    })
  })

  describe('卡片点击', () => {
    it('点击卡片触发 onClick(id)', () => {
      const tpl = buildTemplate()
      const onClick = jest.fn()
      const { queryByClass } = render(<TemplateCard template={tpl} onClick={onClick} />)

      fireClick(queryByClass('template-card')!)
      expect(onClick).toHaveBeenCalledWith('tpl-001')
    })
  })

  describe('上传者区域', () => {
    it('无 author 时不渲染上传者区域', () => {
      const tpl = buildTemplate({ author: undefined })
      const { queryByClass } = render(<TemplateCard template={tpl} />)
      expect(queryByClass('template-card__author-row')).toBeNull()
    })

    it('有 author + authorAvatar 时显示头像图片', () => {
      const tpl = buildTemplate({
        author: '创作者A',
        authorAvatar: 'https://example.com/avatar.png',
      })
      const { queryByClass } = render(<TemplateCard template={tpl} />)

      const avatar = queryByClass('template-card__author-avatar')
      expect(avatar).not.toBeNull()
      expect(avatar?.tagName).toBe('IMG')
    })

    it('有 author 无 authorAvatar 时显示首字母占位符', () => {
      const tpl = buildTemplate({
        author: '创作者A',
        authorAvatar: undefined,
      })
      const { queryByClass, queryByText } = render(<TemplateCard template={tpl} />)

      const placeholder = queryByClass('template-card__author-avatar--placeholder')
      expect(placeholder).not.toBeNull()
      // 首字母为 "创"
      expect(queryByText('创')).not.toBeNull()
    })

    it('有 authorUploadCount 时显示"上传 X"', () => {
      const tpl = buildTemplate({ authorUploadCount: 12 })
      const { queryByText } = render(<TemplateCard template={tpl} />)
      // formatPlay(12) = '12'
      expect(queryByText('上传 12')).not.toBeNull()
    })

    it('有 authorUsedCount 时显示"被用 X"', () => {
      const tpl = buildTemplate({ authorUsedCount: 345 })
      const { queryByText } = render(<TemplateCard template={tpl} />)
      // formatPlay(345) = '345'
      expect(queryByText('被用 345')).not.toBeNull()
    })

    it('无 authorUploadCount 和 authorUsedCount 时不渲染统计区域', () => {
      const tpl = buildTemplate({
        authorUploadCount: undefined,
        authorUsedCount: undefined,
      })
      const { queryByClass } = render(<TemplateCard template={tpl} />)
      expect(queryByClass('template-card__author-stats')).toBeNull()
    })

    it('点击上传者区域触发 onAuthorClick(authorId)', () => {
      const tpl = buildTemplate({ authorId: 'user-001' })
      const onAuthorClick = jest.fn()
      const onClick = jest.fn()
      const { queryByClass } = render(
        <TemplateCard template={tpl} onClick={onClick} onAuthorClick={onAuthorClick} />,
      )

      fireClick(queryByClass('template-card__author-row')!)
      expect(onAuthorClick).toHaveBeenCalledWith('user-001')
      // stopPropagation 应阻止 onClick
      expect(onClick).not.toHaveBeenCalled()
    })

    it('无 authorId 时点击上传者区域不触发 onAuthorClick', () => {
      const tpl = buildTemplate({ authorId: undefined })
      const onAuthorClick = jest.fn()
      const { queryByClass } = render(<TemplateCard template={tpl} onAuthorClick={onAuthorClick} />)

      fireClick(queryByClass('template-card__author-row')!)
      expect(onAuthorClick).not.toHaveBeenCalled()
    })
  })
})
