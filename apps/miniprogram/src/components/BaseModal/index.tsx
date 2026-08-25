/**
 * BaseModal —— 通用弹窗基础组件
 *
 * 抽取共享弹窗（industry-modal / change-password-modal / bind-mobile-modal / upload-modal）
 * 的公共结构：遮罩 + 面板 + 头部（标题/关闭按钮）+ 内容区 + 页脚插槽。
 *
 * 两种形态（variant）：
 *  - bottom-sheet（默认）：底部弹出，顶部圆角 + 滑入动画
 *  - center：居中对话框，淡入缩放动画
 *
 * 关闭规则：
 *  - closable 控制右上角 × 与遮罩点击关闭能力
 *  - busy 为 true 时（提交中/上传中）禁止任何方式关闭
 *  - maskClosable 可单独关闭遮罩点击行为
 */
import { useCallback } from 'react'
import type { ReactNode } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import './index.scss'

export interface BaseModalProps {
  /** 是否显示 */
  visible: boolean
  /** 标题文字（显示在头部左侧） */
  title?: string
  /** 是否可关闭（显示右上角 × 与遮罩点击），默认 true */
  closable?: boolean
  /** 操作中状态：为 true 时禁止任何关闭 */
  busy?: boolean
  /** 遮罩点击是否关闭（依赖 closable），默认 true */
  maskClosable?: boolean
  /** 形态：bottom-sheet 底部弹层 / center 居中弹窗，默认 bottom-sheet */
  variant?: 'bottom-sheet' | 'center'
  /** 关闭回调（点击 × / 遮罩时触发） */
  onClose: () => void
  /** 页脚插槽（通常放操作按钮） */
  footer?: ReactNode
  /** 页脚容器自定义 class（覆盖默认行布局，例如纵向布局） */
  footerClassName?: string
  /** 内容区自定义 class（叠加在 base-modal__body 上，用于自定义内边距/间距） */
  bodyClassName?: string
  /** 内容区是否可滚动（内部渲染 ScrollView），默认 false */
  scrollable?: boolean
  children?: ReactNode
}

export default function BaseModal({
  visible,
  title,
  closable = true,
  busy = false,
  maskClosable = true,
  variant = 'bottom-sheet',
  onClose,
  footer,
  footerClassName,
  bodyClassName,
  scrollable = false,
  children,
}: BaseModalProps) {
  /** 遮罩点击关闭（需可关闭且未被 busy 锁定） */
  const handleMaskTap = useCallback(() => {
    if (closable && maskClosable && !busy) onClose()
  }, [closable, maskClosable, busy, onClose])

  /** 右上角关闭按钮（busy 时禁用） */
  const handleCloseBtn = useCallback(() => {
    if (!busy) onClose()
  }, [busy, onClose])

  /** 阻止点击面板内容冒泡到遮罩 */
  const handleStopPropagation = useCallback((e: { stopPropagation?: () => void }) => {
    e.stopPropagation?.()
  }, [])

  if (!visible) return null

  const showHeader = !!title || closable
  const bodyCls = bodyClassName ? `base-modal__body ${bodyClassName}` : 'base-modal__body'

  return (
    <View className={`base-modal base-modal--${variant}`}>
      <View className="base-modal__mask" onClick={handleMaskTap} />
      <View className="base-modal__panel" catchMove onClick={handleStopPropagation}>
        {showHeader ? (
          <View className="base-modal__header">
            {title ? <Text className="base-modal__title">{title}</Text> : null}
            {closable ? (
              <Text
                className={`base-modal__close ${title ? '' : 'base-modal__close--bare'}`}
                onClick={handleCloseBtn}
              >
                ×
              </Text>
            ) : null}
          </View>
        ) : null}
        {scrollable ? (
          <ScrollView className={bodyCls} scrollY>
            {children}
          </ScrollView>
        ) : (
          <View className={bodyCls}>{children}</View>
        )}
        {footer ? <View className={footerClassName ?? 'base-modal__footer'}>{footer}</View> : null}
      </View>
    </View>
  )
}
