// @ts-expect-error - allow .tsx extension in import path (spec structure: index.tsx + index.ts re-export)
export { default } from './index.tsx'
export type { WorkCardProps, WorkItem, WorkStatus, WorkType } from './index.tsx'
