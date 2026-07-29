import { View, Text, Image } from '@tarojs/components';
import './index.scss';

/**
 * TemplateCard 模板卡片
 * 用于灵感广场、模板列表展示
 */

export interface TemplateItem {
  id: string;
  title: string;
  coverUrl?: string;
  platform?: string;
  author?: string;
  playCount?: number;
  iqScore?: number;
  isFavorited?: boolean;
}

export interface TemplateCardProps {
  template: TemplateItem;
  onClick?: (id: string) => void;
  onFavorite?: (id: string, next: boolean) => void;
}

function formatPlay(n?: number): string {
  if (typeof n !== 'number' || n <= 0) return '0';
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}亿`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n);
}

export default function TemplateCard({
  template,
  onClick,
  onFavorite,
}: TemplateCardProps) {
  const handleTap = () => onClick?.(template.id);

  const handleFav = (e: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    onFavorite?.(template.id, !template.isFavorited);
  };

  return (
    <View className='template-card' onClick={handleTap}>
      <View className='template-card__cover'>
        {template.coverUrl ? (
          <Image
            className='template-card__image'
            src={template.coverUrl}
            mode='aspectFill'
            lazyLoad
          />
        ) : (
          <View className='template-card__placeholder'>模板</View>
        )}
        {template.platform ? (
          <View className='template-card__platform'>{template.platform}</View>
        ) : null}
        <View
          className={`template-card__fav ${
            template.isFavorited ? 'template-card__fav--on' : ''
          }`}
          onClick={handleFav}
        >
          <Text>{template.isFavorited ? '♥' : '♡'}</Text>
        </View>
      </View>
      <View className='template-card__body'>
        <Text className='template-card__title'>{template.title}</Text>
        <View className='template-card__meta'>
          {template.author ? (
            <Text className='template-card__author'>@{template.author}</Text>
          ) : null}
          <Text className='template-card__plays'>
            ▶ {formatPlay(template.playCount)}
          </Text>
        </View>
        {typeof template.iqScore === 'number' ? (
          <View className='template-card__iq'>
            <Text className='template-card__iq-label'>IQ</Text>
            <Text className='template-card__iq-value'>{template.iqScore}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
