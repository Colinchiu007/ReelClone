// ============================================================
// ReelClone 全局组件库统一导出
// 使用方式：import { GradientIcon, WorkCard } from '@/components'
// ============================================================

export { default as GradientIcon } from './GradientIcon';
export type {
  GradientIconProps,
  GradientIconName,
  GradientVariant,
} from './GradientIcon';

export { EmptyState, LoadingState, ErrorState } from './StateComponents';
export type {
  EmptyStateProps,
  LoadingStateProps,
  ErrorStateProps,
} from './StateComponents';

export { default as WorkCard } from './WorkCard';
export type { WorkCardProps, WorkItem, WorkStatus, WorkType } from './WorkCard';

export { default as TemplateCard } from './TemplateCard';
export type { TemplateCardProps, TemplateItem } from './TemplateCard';

export { default as CreditBadge } from './CreditBadge';
export type { CreditBadgeProps } from './CreditBadge';

export { default as MediaUploader } from './MediaUploader';
export type { MediaUploaderProps } from './MediaUploader';

export { default as PromptInput } from './PromptInput';
export type { PromptInputProps } from './PromptInput';

export { default as IndustryPicker, DEFAULT_INDUSTRIES } from './IndustryPicker';
export type { IndustryPickerProps } from './IndustryPicker';

export { default as QuickCreate } from './QuickCreate';
export type { QuickCreateProps } from './QuickCreate';
