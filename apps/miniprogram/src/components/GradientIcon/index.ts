// @ts-expect-error - allow .tsx extension in import path (spec structure: index.tsx + index.ts re-export)
export { default } from './index.tsx';
// @ts-expect-error - allow .tsx extension in import path
export type {
  GradientIconProps,
  GradientIconName,
  GradientVariant,
} from './index.tsx';
