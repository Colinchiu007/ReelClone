/**
 * render —— 轻量级 React 组件测试辅助
 *
 * 实现：基于 react-dom/client 的 createRoot + react 的 act，
 *       不依赖 @testing-library/react（项目未安装）。
 *
 * 用法：
 *   const { container, queryByText, getByText, unmount, rerender } = render(<MyComponent />)
 *   expect(getByText('hello')).toBeDefined()
 *
 * 提供的查询器（简化版）：
 *  - queryByText(text): 返回匹配文本的 HTMLElement | null
 *  - queryAllByText(text): 返回所有匹配文本的 HTMLElement[]
 *  - getByText(text): 返回匹配文本的 HTMLElement，找不到抛错
 *  - queryByClass(className): 返回包含指定 class 的 HTMLElement | null
 *  - queryAllByClass(className): 返回所有包含指定 class 的 HTMLElement[]
 */
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import React from 'react'

export { act }

/** render 返回值 */
export interface RenderResult {
  /** 根容器节点 */
  container: HTMLElement
  /** 按文本内容查询第一个匹配节点 */
  queryByText: (text: string) => HTMLElement | null
  /** 按文本内容查询所有匹配节点 */
  queryAllByText: (text: string) => HTMLElement[]
  /** 按文本内容查询，找不到抛错 */
  getByText: (text: string) => HTMLElement
  /** 按 class 查询第一个匹配节点（支持多个 class，空格分隔） */
  queryByClass: (className: string) => HTMLElement | null
  /** 按 class 查询所有匹配节点 */
  queryAllByClass: (className: string) => HTMLElement[]
  /** 卸载组件 */
  unmount: () => void
  /** 用新 props 重新渲染 */
  rerender: (element: React.ReactElement) => void
}

/** 检查元素文本内容是否匹配（递归子节点） */
function elementText(el: Element): string {
  // 收集所有文本节点的内容
  let text = ''
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i]
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || ''
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      text += elementText(node as Element)
    }
  }
  return text
}

/** 检查元素是否包含指定 class（支持多个 class，空格分隔，需全部包含） */
function hasClass(el: Element, className: string): boolean {
  const required = className.split(/\s+/).filter(Boolean)
  return required.every((c) => el.classList.contains(c))
}

/**
 * 渲染一个 React 组件
 *
 * @param element 要渲染的 React 元素
 * @returns 查询器和清理函数
 */
export function render(element: React.ReactElement): RenderResult {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(element)
  })

  const queryAllByText = (text: string): HTMLElement[] => {
    const all = container.querySelectorAll('*')
    const matches: HTMLElement[] = []
    all.forEach((el) => {
      // 检查元素的直接文本内容（不含子元素文本）是否精确匹配
      // 或元素的完整文本内容是否包含目标文本
      const directText = elementText(el).trim()
      if (directText === text) {
        matches.push(el as HTMLElement)
      }
    })
    return matches
  }

  const queryByText = (text: string): HTMLElement | null => {
    return queryAllByText(text)[0] || null
  }

  const getByText = (text: string): HTMLElement => {
    const el = queryByText(text)
    if (!el) {
      throw new Error(`getByText: 未找到文本内容 "${text}"`)
    }
    return el
  }

  const queryAllByClass = (className: string): HTMLElement[] => {
    const all = container.querySelectorAll('*')
    const matches: HTMLElement[] = []
    all.forEach((el) => {
      if (hasClass(el, className)) {
        matches.push(el as HTMLElement)
      }
    })
    return matches
  }

  const queryByClass = (className: string): HTMLElement | null => {
    return queryAllByClass(className)[0] || null
  }

  const unmount = () => {
    act(() => {
      root.unmount()
    })
    if (container.parentNode) {
      container.parentNode.removeChild(container)
    }
  }

  const rerender = (next: React.ReactElement) => {
    act(() => {
      root.render(next)
    })
  }

  return {
    container,
    queryByText,
    queryAllByText,
    getByText,
    queryByClass,
    queryAllByClass,
    unmount,
    rerender,
  }
}

/**
 * 触发元素点击事件（兼容 Taro 组件的 onClick）
 *
 * @param el 目标元素
 * @param options 事件初始化选项
 */
export function fireClick(el: Element, options: MouseEventInit = {}): void {
  act(() => {
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      ...options,
    })
    el.dispatchEvent(event)
  })
}

/**
 * 等待所有微任务/定时器完成（用于 useEffect 异步副作用）
 *
 * 兼容 node 和 jsdom 环境（jsdom 无 setImmediate，使用 setTimeout(0) 替代）
 */
export async function flushAsync(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  })
}
