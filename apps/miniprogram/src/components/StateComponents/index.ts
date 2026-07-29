// @ts-expect-error - allow .tsx extension in import path (spec structure: index.tsx + index.ts re-export)
export { EmptyState, LoadingState, ErrorState } from './index.tsx'
export type { EmptyStateProps, LoadingStateProps, ErrorStateProps } from './index.tsx'
