import { View, Text, Image } from '@tarojs/components';
import './index.scss';

/**
 * WorkCard 作品卡片
 * 用于「我的作品」列表展示
 */

export type WorkStatus = 'generating' | 'completed' | 'failed';

export type WorkType =
  | 'text'
  | 'image'
  | 'video'
  | '3d'
  | 'edit'
  | 'extend'
  | 'benchmark'
  | 'template';

export interface WorkItem {
  id: string;
  title: string;
  coverUrl?: string;
  status: WorkStatus;
  workType: WorkType;
  createdAt?: string | number;
}

export interface WorkCardProps {
  work: WorkItem;
  onClick?: (id: string) => void;
}

const STATUS_MAP: Record<WorkStatus, { label: string; cls: string }> = {
  generating: { label: '生成中', cls: 'work-card__badge--generating' },
  completed: { label: '已完成', cls: 'work-card__badge--completed' },
  failed: { label: '失败', cls: 'work-card__badge--failed' },
};

const WORK_TYPE_LABEL: Record<WorkType, string> = {
  text: '文本',
  image: '图片',
  video: '视频',
  '3d': '3D',
  edit: '编辑',
  extend: '延长',
  benchmark: '对标',
  template: '模板',
};

function formatDate(ts?: string | number): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

export default function WorkCard({ work, onClick }: WorkCardProps) {
  const status = STATUS_MAP[work.status];
  const handleTap = () => onClick?.(work.id);

  return (
    <View className='work-card' onClick={handleTap}>
      <View className='work-card__cover'>
        {work.coverUrl ? (
          <Image
            className='work-card__image'
            src={work.coverUrl}
            mode='aspectFill'
            lazyLoad
          />
        ) : (
          <View className='work-card__placeholder'>
            {WORK_TYPE_LABEL[work.workType]}
          </View>
        )}
        <View className={`work-card__badge ${status.cls}`}>
          <Text>{status.label}</Text>
        </View>
      </View>
      <View className='work-card__body'>
        <Text className='work-card__title'>{work.title}</Text>
        <View className='work-card__meta'>
          <Text className='work-card__type'>
            {WORK_TYPE_LABEL[work.workType]}
          </Text>
          {work.createdAt ? (
            <Text className='work-card__time'>{formatDate(work.createdAt)}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}
