import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import GradientIcon, {
  type GradientIconName,
  type GradientVariant,
} from '../GradientIcon';
import './index.scss';

/**
 * QuickCreate 快捷创作浮层
 * 半透明遮罩 + 底部弹出卡片，8 个创作入口
 */

export interface QuickCreateProps {
  visible: boolean;
  onClose: () => void;
}

interface Entry {
  name: GradientIconName;
  variant: GradientVariant;
  label: string;
  path: string;
}

const ENTRIES: Entry[] = [
  { name: 'text', variant: 1, label: '文本生成', path: '/pages/workbench/text/index' },
  { name: 'image', variant: 2, label: '图片生成', path: '/pages/workbench/image/index' },
  { name: 'video', variant: 3, label: '视频生成', path: '/pages/workbench/video-text/index' },
  { name: '3d', variant: 4, label: '3D建模', path: '/pages/workbench/video-text/index?type=3d' },
  { name: 'edit', variant: 5, label: '编辑视频', path: '/pages/workbench/video-edit/index' },
  { name: 'extend', variant: 6, label: '延长视频', path: '/pages/workbench/video-extend/index' },
  { name: 'benchmark', variant: 7, label: '视频对标', path: '/pages/benchmark/index' },
  { name: 'template', variant: 8, label: '灵感模板', path: '/pages/template/gallery/index' },
];

export default function QuickCreate({ visible, onClose }: QuickCreateProps) {
  if (!visible) return null;

  const handleMaskClick = () => onClose();

  const handleEntryClick = (path: string) => {
    onClose();
    Taro.navigateTo({ url: path }).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[QuickCreate] navigateTo failed:', err);
    });
  };

  const handleCardClick = (e: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
  };

  return (
    <View className='quick-create' onClick={handleMaskClick}>
      <View
        className={`quick-create__card quick-create__card--${visible ? 'in' : 'out'}`}
        onClick={handleCardClick}
      >
        <View className='quick-create__header'>
          <Text className='quick-create__title'>快捷创作</Text>
          <View className='quick-create__close' onClick={handleMaskClick}>
            <Text>×</Text>
          </View>
        </View>
        <ScrollView className='quick-create__grid' scrollY={false}>
          {ENTRIES.map((entry) => (
            <View
              key={entry.label}
              className='quick-create__item'
              onClick={() => handleEntryClick(entry.path)}
            >
              <GradientIcon name={entry.name} variant={entry.variant} size={88} />
              <Text className='quick-create__label'>{entry.label}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}
