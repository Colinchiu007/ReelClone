import { useState, useCallback } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro, { useLoad, useDidShow } from '@tarojs/taro';
import {
  GradientIcon,
  TemplateCard,
  QuickCreate,
  LoadingState,
  ErrorState,
  EmptyState,
  type GradientIconName,
  type GradientVariant,
  type TemplateItem,
} from '@/components';
import { listTemplates } from '@/services/api/template.api';
import { getUnreadCount } from '@/services/api/notification.api';
import { getCurrentUser } from '@/services/api/user.api';
import { useAuthStore } from '@/stores/auth.store';
import { useNotificationStore } from '@/stores/notification.store';
import './index.scss';

interface GridEntry {
  name: GradientIconName;
  variant: GradientVariant;
  label: string;
  path: string;
  isTab?: boolean;
}

const GRID_ENTRIES: GridEntry[] = [
  { name: 'text', variant: 1, label: '文本生成', path: '/pages/workbench/text/index' },
  { name: 'image', variant: 2, label: '图片生成', path: '/pages/workbench/image/index' },
  { name: 'video', variant: 3, label: '视频生成', path: '/pages/workbench/video-text/index' },
  { name: '3d', variant: 4, label: '3D建模', path: '/pages/workbench/video-text/index?type=3d' },
  { name: 'edit', variant: 5, label: '编辑视频', path: '/pages/workbench/video-edit/index' },
  { name: 'extend', variant: 6, label: '延长视频', path: '/pages/workbench/video-extend/index' },
  { name: 'benchmark', variant: 7, label: '视频对标', path: '/pages/benchmark/index', isTab: true },
  { name: 'template', variant: 8, label: '灵感模板', path: '/pages/template/gallery/index' },
];

export default function Index() {
  const { user, setUser } = useAuthStore();
  const { unreadCount, setUnreadCount } = useNotificationStore();
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [quickVisible, setQuickVisible] = useState(false);

  const loadRecommend = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await listTemplates({ pageSize: 10 });
      setTemplates(res.data.list as unknown as TemplateItem[]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUserAndNotifications = useCallback(async () => {
    try {
      const [freshUser, count] = await Promise.all([
        getCurrentUser(),
        getUnreadCount(),
      ]);
      setUser(freshUser);
      setUnreadCount(count);
    } catch {
      // 静默失败：未登录或网络异常不影响页面渲染
    }
  }, [setUser, setUnreadCount]);

  useLoad(() => {
    loadRecommend();
    refreshUserAndNotifications();
  });

  useDidShow(() => {
    // 页面再次显示时刷新未读数
    getUnreadCount().then(setUnreadCount).catch(() => {});
  });

  const handleGridTap = (entry: GridEntry) => {
    if (entry.isTab) {
      Taro.switchTab({ url: entry.path });
    } else {
      Taro.navigateTo({ url: entry.path });
    }
  };

  const handleTemplateClick = (id: string) => {
    Taro.navigateTo({ url: `/pages/template/detail/index?id=${id}` });
  };

  const handleSeeAll = () => {
    Taro.switchTab({ url: '/pages/recommend/index' });
  };

  const handleBellTap = () => {
    Taro.showToast({ title: '通知中心即将上线', icon: 'none' });
  };

  const handleAvatarTap = () => {
    Taro.switchTab({ url: '/pages/mine/index' });
  };

  const leftCol = templates.filter((_, i) => i % 2 === 0);
  const rightCol = templates.filter((_, i) => i % 2 === 1);

  return (
    <View className='home'>
      <View className='home__topbar'>
        <View className='home__avatar' onClick={handleAvatarTap}>
          {user?.avatarUrl ? (
            <Image className='home__avatar-img' src={user.avatarUrl} mode='aspectFill' />
          ) : (
            <View className='home__avatar-placeholder'>
              <Text>{user?.nickname?.[0] || 'U'}</Text>
            </View>
          )}
        </View>
        <Text className='home__title'>ReelClone</Text>
        <View className='home__bell' onClick={handleBellTap}>
          <Text className='home__bell-icon'>🔔</Text>
          {unreadCount > 0 && <View className='home__bell-dot' />}
        </View>
      </View>

      <View className='home__grid'>
        {GRID_ENTRIES.map((entry) => (
          <View
            key={entry.label}
            className='home__grid-item'
            onClick={() => handleGridTap(entry)}
          >
            <GradientIcon name={entry.name} variant={entry.variant} size={88} />
            <Text className='home__grid-label'>{entry.label}</Text>
          </View>
        ))}
      </View>

      <View className='home__section'>
        <View className='home__section-header'>
          <Text className='home__section-title'>为你推荐</Text>
          <Text className='home__section-more' onClick={handleSeeAll}>全部 ›</Text>
        </View>

        {loading ? (
          <LoadingState title='加载推荐中...' />
        ) : error ? (
          <ErrorState title='加载失败' description='点击重试' onRetry={loadRecommend} />
        ) : templates.length === 0 ? (
          <EmptyState title='暂无推荐' description='敬请期待更多灵感' />
        ) : (
          <View className='home__waterfall'>
            <View className='home__waterfall-col'>
              {leftCol.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onClick={handleTemplateClick}
                />
              ))}
            </View>
            <View className='home__waterfall-col'>
              {rightCol.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onClick={handleTemplateClick}
                />
              ))}
            </View>
          </View>
        )}
      </View>

      <View className='home__fab' onClick={() => setQuickVisible(true)}>
        <Text className='home__fab-icon'>+</Text>
      </View>

      <QuickCreate visible={quickVisible} onClose={() => setQuickVisible(false)} />
    </View>
  );
}
