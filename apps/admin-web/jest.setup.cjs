/**
 * Jest 环境初始化 — @reelclone/admin-web
 *
 * - 注册 @testing-library/jest-dom 的 DOM 断言 matchers
 * - polyfill antd v5 依赖但 jsdom 缺失的浏览器 API（matchMedia / ResizeObserver / scrollIntoView）
 */
require('@testing-library/jest-dom')

// antd v5 responsive 布局依赖 matchMedia
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

// @rc-component/resize-observer 依赖 ResizeObserver（Table 等组件使用）。
// observe 时必须派发一次 entry（尺寸 0x0）：jsdom 无真实布局，若不回调，
// rc-table 无法完成首次度量，表格数据行根本不会渲染（测试找不到单元格/按钮）。
// 已知限制：受 React act() 排空机制影响，含数据行的 Table 渲染测试单个约 +30s，
// 属于 jsdom + antd v5 的固有开销；页面级测试用例体本身仅数百毫秒。
class ResizeObserver {
  constructor(callback) {
    this.callback = callback
  }
  observe(target) {
    queueMicrotask(() => {
      this.callback(
        [{ target, contentRect: { width: 0, height: 0, x: 0, y: 0, top: 0, right: 0, bottom: 0, left: 0 } }],
        this,
      )
    })
  }
  unobserve() {}
  disconnect() {}
  static create() {
    return new ResizeObserver(this)
  }
}
window.ResizeObserver = window.ResizeObserver || ResizeObserver
globalThis.ResizeObserver = globalThis.ResizeObserver || ResizeObserver

// 部分组件滚动定位需要 scrollIntoView
window.HTMLElement.prototype.scrollIntoView =
  window.HTMLElement.prototype.scrollIntoView || (() => {})

// jsdom 的 rAF 走 16ms timer，antd 内部若存在 rAF 轮询会让 act(async) cleanup 拖慢数十秒；
// 收紧为 setTimeout(0) 加速其收敛（仅测试环境）。
window.requestAnimationFrame =
  window.requestAnimationFrame || ((cb) => setTimeout(() => cb(Date.now()), 0))
window.cancelAnimationFrame = window.cancelAnimationFrame || ((id) => clearTimeout(id))