import { View, Text, Button } from '@tarojs/components';
import './index.scss';

/**
 * StateComponents 状态组件集合
 * 包含 EmptyState / LoadingState / ErrorState 三个组件
 * 用于列表空、加载中、加载失败等场景
 */

export interface EmptyStateProps {
  title?: string;
  description?: string;
  /** 自定义图标（emoji 或字符），默认 📭 */
  icon?: string;
}

export interface LoadingStateProps {
  title?: string;
  fullScreen?: boolean;
}

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function EmptyState({
  title = '暂无数据',
  description,
  icon = '📭',
}: EmptyStateProps) {
  return (
    <View className='state state--empty'>
      <View className='state__icon'>{icon}</View>
      <Text className='state__title'>{title}</Text>
      {description ? <Text className='state__desc'>{description}</Text> : null}
    </View>
  );
}

export function LoadingState({
  title = '加载中...',
  fullScreen = false,
}: LoadingStateProps) {
  return (
    <View
      className={`state state--loading ${fullScreen ? 'state--fullscreen' : ''}`}
    >
      <View className='state__spinner' />
      <Text className='state__title'>{title}</Text>
    </View>
  );
}

export function ErrorState({
  title = '加载失败',
  description,
  onRetry,
}: ErrorStateProps) {
  return (
    <View className='state state--error'>
      <View className='state__icon'>⚠️</View>
      <Text className='state__title'>{title}</Text>
      {description ? <Text className='state__desc'>{description}</Text> : null}
      {onRetry ? (
        <Button className='state__retry' onClick={onRetry}>
          重新加载
        </Button>
      ) : null}
    </View>
  );
}
