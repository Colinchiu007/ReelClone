import { View } from '@tarojs/components';
import './index.scss';

/**
 * GradientIcon 渐变图标组件
 * 圆形容器 + 8 种渐变背景 + 白色 SVG 图标
 * 用于快捷创作入口、宫格图标等场景
 */

export type GradientIconName =
  | 'text'
  | 'image'
  | 'video'
  | '3d'
  | 'edit'
  | 'extend'
  | 'benchmark'
  | 'template';

export type GradientVariant = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface GradientIconProps {
  /** 图标名称 */
  name: GradientIconName;
  /** 容器尺寸（px），默认 48 */
  size?: number;
  /** 渐变方案 1-8，默认 1 */
  variant?: GradientVariant;
}

// 8 个图标的 SVG path（24x24 viewBox，stroke 风格）
const ICON_PATHS: Record<GradientIconName, string> = {
  text: 'M4 6h16M4 12h16M4 18h10',
  image: 'M4 5h16v14H4zM8 10a2 2 0 100 4 2 2 0 000-4zM5 19l5-5 3 3 4-4 4 4',
  video: 'M3 5h13v14H3zM19 8l3-2v12l-3-2z',
  '3d': 'M12 3l9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v10',
  edit: 'M3 21l4-1L20 7l-3-3L4 17zM17 4l3 3-2 2-3-3z',
  extend: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM15 15h6v6h-6z',
  benchmark: 'M4 20V9M10 20V4M16 20v-9M22 20H2',
  template: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
};

// 构造 SVG data-uri（小程序不支持内联 <svg>，用 background-image 实现）
function buildSvgDataUri(path: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' ` +
    `stroke='#FFFFFF' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>` +
    `<path d='${path}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export default function GradientIcon({
  name,
  size = 48,
  variant = 1,
}: GradientIconProps) {
  const containerStyle = {
    width: `${size}px`,
    height: `${size}px`,
  };
  const symbolSize = Math.round(size * 0.55);
  const symbolStyle = {
    width: `${symbolSize}px`,
    height: `${symbolSize}px`,
    backgroundImage: buildSvgDataUri(ICON_PATHS[name]),
  };

  return (
    <View
      className={`gradient-icon gradient-icon--v${variant}`}
      style={containerStyle}
    >
      <View className='gradient-icon__symbol' style={symbolStyle} />
    </View>
  );
}
