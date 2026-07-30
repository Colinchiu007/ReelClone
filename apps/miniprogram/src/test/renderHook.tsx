/**
 * renderHook —— 轻量级 React Hook 测试辅助
 *
 * 实现：基于 react-dom/client 的 createRoot + react 的 act，
 *       不依赖 @testing-library/react（项目未安装）。
 *
 * 用法：
 *   const { result, rerender, unmount } = renderHook(() => useMyHook())
 *   await act(async () => { await result.current.doSomething() })
 *   expect(result.current.value).toBe('expected')
 */
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import React, { useState } from 'react'

// React 18.3+ 已将 act 从 react-dom/test-utils 迁移至 react
// 此处统一从 react 导入，避免弃用警告
export { act }

/** renderHook 返回值 */
export interface RenderHookResult<T, P = unknown> {
  /** 当前 hook 返回值（通过 .current 访问） */
  result: React.MutableRefObject<T>
  /** 用新 props 重新渲染 */
  rerender: (newProps?: P) => void
  /** 卸载组件 */
  unmount: () => void
}

interface RenderHookOptions<P> {
  /** 初始 props */
  initialProps?: P
}

/**
 * 渲染一个 hook
 *
 * @param callback 接收 props 并返回 hook 返回值（与 RTL API 一致）
 * @param options  渲染选项
 *
 * 实现要点：
 *  - useState 必须在 TestComponent 内部调用（React Hooks 规则）
 *  - propsRef 用普通对象在闭包中共享，避免 useState 在工具函数顶层调用
 *  - forceUpdateRef 保存 setState 引用，外部 rerender 通过它触发更新
 */
export function renderHook<P, R>(
  callback: (props: P) => R,
  options: RenderHookOptions<P> = {},
): RenderHookResult<R, P> {
  const result: React.MutableRefObject<R> = { current: undefined as unknown as R }
  const propsRef: { current: P | undefined } = { current: options.initialProps }
  const forceUpdateRef: { current: (() => void) | null } = { current: null }

  function TestComponent() {
    // useState 必须在组件内部调用，用于触发 rerender
    const [, setTick] = useState(0)
    forceUpdateRef.current = () => setTick((t) => t + 1)

    // 调用 hook 并捕获返回值
    result.current = callback((propsRef.current as P) ?? (undefined as unknown as P))
    return null
  }

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(<TestComponent />)
  })

  const rerender = (newProps?: P) => {
    if (newProps !== undefined) {
      propsRef.current = newProps
    }
    if (forceUpdateRef.current) {
      act(() => {
        forceUpdateRef.current!()
      })
    } else {
      // fallback：直接重新 render
      act(() => {
        root.render(<TestComponent />)
      })
    }
  }

  const unmount = () => {
    act(() => {
      root.unmount()
    })
    if (container.parentNode) {
      container.parentNode.removeChild(container)
    }
  }

  return { result, rerender, unmount }
}

/**
 * 等待所有微任务/定时器完成（用于 useEffect 异步副作用）
 *
 * 兼容 node 和 jsdom 环境（jsdom 无 setImmediate，使用 setTimeout(0) 替代）
 */
export async function flushAsync(): Promise<void> {
  await act(async () => {
    // 等待一个微任务
    await Promise.resolve()
    // 等待下一轮事件循环（兼容 jsdom）
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  })
}
