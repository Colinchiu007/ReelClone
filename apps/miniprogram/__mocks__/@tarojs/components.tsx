/**
 * @tarojs/components mock for Jest tests
 *
 * 将 Taro 组件映射到标准 HTML 元素，使组件测试在 jsdom 环境下稳定运行。
 *
 * 映射关系：
 *  - View → div
 *  - Text → span
 *  - Image → img
 *  - ScrollView → div
 *  - Swiper / SwiperItem → div
 *  - Input → input
 *  - Textarea → textarea
 *  - Button → button
 *
 * 保留所有 props 透传（onClick / className / src 等），以便测试交互。
 */
import React from 'react'

/** 通用 HTML 元素代理工厂 */
function createProxy<T extends keyof HTMLElementTagNameMap>(tagName: T) {
  return React.forwardRef<HTMLElementTagNameMap[T], Record<string, unknown>>((props, ref) => {
    // 过滤 Taro 专属 props（如 lazyLoad / mode 等），保留 HTML 可识别属性
    const {
      // Taro Image 专属
      mode: _mode,
      lazyLoad: _lazyLoad,
      // Taro 通用
      ...htmlProps
    } = props
    return React.createElement(tagName, { ...htmlProps, ref })
  }) as unknown as React.ComponentType<Record<string, unknown>>
}

export const View = createProxy('div')
export const Text = createProxy('span')
export const Image = createProxy('img')
export const ScrollView = createProxy('div')
export const Swiper = createProxy('div')
export const SwiperItem = createProxy('div')
export const Input = createProxy('input')
export const Textarea = createProxy('textarea')
export const Button = createProxy('button')
export const Picker = createProxy('div')
export const PickerView = createProxy('div')
export const PickerViewColumn = createProxy('div')
export const Switch = createProxy('input')
export const Slider = createProxy('input')
export const Checkbox = createProxy('input')
export const CheckboxGroup = createProxy('div')
export const Radio = createProxy('input')
export const RadioGroup = createProxy('div')
export const Label = createProxy('label')
export const Form = createProxy('form')
export const Navigator = createProxy('a')
export const Video = createProxy('div')
export const Canvas = createProxy('canvas')
export const WebView = createProxy('div')
export const MovableArea = createProxy('div')
export const MovableView = createProxy('div')

export default {
  View,
  Text,
  Image,
  ScrollView,
  Swiper,
  SwiperItem,
  Input,
  Textarea,
  Button,
  Picker,
  PickerView,
  PickerViewColumn,
  Switch,
  Slider,
  Checkbox,
  CheckboxGroup,
  Radio,
  RadioGroup,
  Label,
  Form,
  Navigator,
  Video,
  Canvas,
  WebView,
  MovableArea,
  MovableView,
}
