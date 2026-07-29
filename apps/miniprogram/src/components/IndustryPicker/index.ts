// @ts-expect-error - allow .tsx extension in import path (spec structure: index.tsx + index.ts re-export)
export { default, DEFAULT_INDUSTRIES } from './index.tsx'
export type { IndustryPickerProps } from './index.tsx'
