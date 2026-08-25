/**
 * @jest-environment jsdom
 *
 * BaseModal 通用弹窗组件单元测试
 *
 * 覆盖场景：
 *  - visible=false 时不渲染任何内容
 *  - 基础渲染：遮罩 / 面板 / 标题 / 内容 / 页脚
 *  - 右上角 × 关闭按钮触发 onClose
 *  - 点击遮罩触发 onClose
 *  - 点击面板内容不触发 onClose（stopPropagation）
 *  - busy 状态下禁止关闭（× 与遮罩均无效）
 *  - closable=false 时不渲染关闭按钮，遮罩点击不关闭
 *  - maskClosable=false 时遮罩点击不关闭（但 × 仍可关闭）
 *  - 无 title 且有 close 时仅渲染 close（含 --bare 类）
 *  - footer slide 渲染与 footerClassName 覆盖
 *  - scrollable 渲染 ScrollView（body 类名保留）
 *  - variant='center' 渲染居中面板
 */
import { render, fireClick } from '../../../test/render'
import BaseModal from '../index'

describe('BaseModal', () => {
  describe('渲染控制', () => {
    it('visible=false 时不渲染任何内容', () => {
      const { queryByClass } = render(
        <BaseModal visible={false} onClose={jest.fn()}>
          <span>内容</span>
        </BaseModal>,
      )
      expect(queryByClass('base-modal')).toBeNull()
    })

    it('visible=true 时渲染遮罩、面板、标题与内容', () => {
      const { queryByClass, queryByText } = render(
        <BaseModal visible title="测试标题" onClose={jest.fn()}>
          <span>弹窗内容</span>
        </BaseModal>,
      )
      expect(queryByClass('base-modal')).not.toBeNull()
      expect(queryByClass('base-modal__mask')).not.toBeNull()
      expect(queryByClass('base-modal__panel')).not.toBeNull()
      expect(queryByText('测试标题')).not.toBeNull()
      expect(queryByText('弹窗内容')).not.toBeNull()
    })

    it('默认形态为 bottom-sheet', () => {
      const { queryByClass } = render(<BaseModal visible onClose={jest.fn()} />)
      expect(queryByClass('base-modal--bottom-sheet')).not.toBeNull()
    })

    it("variant='center' 渲染居中面板", () => {
      const { queryByClass } = render(<BaseModal visible variant="center" onClose={jest.fn()} />)
      expect(queryByClass('base-modal--center')).not.toBeNull()
    })
  })

  describe('关闭交互', () => {
    it('点击右上角 × 触发 onClose', () => {
      const onClose = jest.fn()
      const { queryByClass } = render(<BaseModal visible title="标题" onClose={onClose} />)
      fireClick(queryByClass('base-modal__close')!)
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('点击遮罩触发 onClose', () => {
      const onClose = jest.fn()
      const { queryByClass } = render(<BaseModal visible title="标题" onClose={onClose} />)
      fireClick(queryByClass('base-modal__mask')!)
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('点击面板内容不触发 onClose（stopPropagation 不冒泡到遮罩）', () => {
      const onClose = jest.fn()
      const { queryByText, queryByClass } = render(
        <BaseModal visible title="标题" onClose={onClose}>
          <span>内容区</span>
        </BaseModal>,
      )
      fireClick(queryByText('内容区')!)
      expect(onClose).not.toHaveBeenCalled()
      // 面板自身也无关闭副作用
      fireClick(queryByClass('base-modal__panel')!)
      expect(onClose).not.toHaveBeenCalled()
    })

    it('busy 状态下点击 × 与遮罩均不触发 onClose', () => {
      const onClose = jest.fn()
      const { queryByClass } = render(<BaseModal visible title="标题" busy onClose={onClose} />)
      fireClick(queryByClass('base-modal__close')!)
      fireClick(queryByClass('base-modal__mask')!)
      expect(onClose).not.toHaveBeenCalled()
    })

    it('closable=false 时不渲染关闭按钮，遮罩点击不关闭', () => {
      const onClose = jest.fn()
      const { queryByClass } = render(
        <BaseModal visible title="标题" closable={false} onClose={onClose} />,
      )
      expect(queryByClass('base-modal__close')).toBeNull()
      fireClick(queryByClass('base-modal__mask')!)
      expect(onClose).not.toHaveBeenCalled()
    })

    it('maskClosable=false 时遮罩点击不关闭，但 × 仍可关闭', () => {
      const onClose = jest.fn()
      const { queryByClass } = render(
        <BaseModal visible title="标题" maskClosable={false} onClose={onClose} />,
      )
      fireClick(queryByClass('base-modal__mask')!)
      expect(onClose).not.toHaveBeenCalled()
      fireClick(queryByClass('base-modal__close')!)
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('头部与页脚', () => {
    it('无 title 有 close 时渲染 close 且带 --bare 类', () => {
      const { queryByClass } = render(<BaseModal visible onClose={jest.fn()} />)
      const close = queryByClass('base-modal__close')
      expect(close).not.toBeNull()
      expect(close?.className).toContain('base-modal__close--bare')
    })

    it('无 title 且 closable=false 时不渲染头部', () => {
      const { queryByClass } = render(<BaseModal visible closable={false} onClose={jest.fn()} />)
      expect(queryByClass('base-modal__header')).toBeNull()
    })

    it('footer 插槽渲染在默认页脚容器', () => {
      const { queryByText, queryByClass } = render(
        <BaseModal visible title="标题" onClose={jest.fn()} footer={<span>确定</span>} />,
      )
      expect(queryByText('确定')).not.toBeNull()
      expect(queryByClass('base-modal__footer')).not.toBeNull()
    })

    it('footerClassName 覆盖页脚容器类名', () => {
      const { queryByClass } = render(
        <BaseModal
          visible
          title="标题"
          onClose={jest.fn()}
          footerClassName="custom-footer"
          footer={<span>确定</span>}
        />,
      )
      expect(queryByClass('custom-footer')).not.toBeNull()
      expect(queryByClass('base-modal__footer')).toBeNull()
    })

    it('bodyClassName 叠加到内容区', () => {
      const { queryByClass } = render(
        <BaseModal visible title="标题" bodyClassName="custom-body" onClose={jest.fn()}>
          <span>内容</span>
        </BaseModal>,
      )
      const body = queryByClass('base-modal__body')
      expect(body).not.toBeNull()
      expect(body?.className).toContain('custom-body')
    })
  })

  describe('可滚动内容', () => {
    it('scrollable 时渲染 ScrollView（div）且保留 body 类名', () => {
      const { queryByClass } = render(
        <BaseModal visible title="标题" scrollable onClose={jest.fn()}>
          <span>长内容</span>
        </BaseModal>,
      )
      const body = queryByClass('base-modal__body')
      expect(body).not.toBeNull()
      expect(body?.tagName).toBe('DIV')
    })
  })
})
