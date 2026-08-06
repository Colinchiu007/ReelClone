/**
 * 模板详情页（template 分包）
 * 对应 FR4 - 模板详情
 *
 * 功能：
 *  - 接收 templateId 参数
 *  - 顶部：返回 + 标题 + 收藏按钮
 *  - 视频播放区：Taro Video 组件（src 必须 https）
 *  - 信息区：标题 / 平台 + 作者 / 播放量 IQ 热度 / 标签 / 描述
 *  - 操作区：基于此模板创作 → workbench；收藏/已收藏切换
 *  - 相关推荐：同平台其他模板（横向滚动）
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text, Video, ScrollView, Image } from '@tarojs/components';
import Taro, { useRouter, useShareAppMessage } from '@tarojs/taro';
import { LoadingState, ErrorState } from '@/components';
import {
  favoriteTemplate,
  getTemplate,
  listTemplates,
  unfavoriteTemplate,
} from '@/services/api/template.api';
import type { Template } from '@/types';
import './index.scss';

/** 平台中文显示 */
const PLATFORM_LABEL: Record<string, string> = {
  DOUYIN: '抖音',
  XIAOHONGSHU: '小红书',
  BILIBILI: 'B站',
  WECHAT_VIDEO: '视频号',
  KUAISHOU: '快手',
};

/** 播放量格式化 */
function formatPlay(n?: number): string {
  if (typeof n !== 'number' || n <= 0) return '0';
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}亿`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n);
}

export default function TemplateDetailPage() {
  const router = useRouter();
  const templateId = (router.params.templateId || '') as string;

  const [detail, setDetail] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [favoriting, setFavoriting] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [related, setRelated] = useState<Template[]>([]);

  useShareAppMessage(() => ({
    title: detail?.title || '模板详情',
    path: `/pages/template/detail/index?templateId=${templateId}`,
    imageUrl: detail?.coverUrl || undefined,
  }));

  /** 加载详情 */
  const fetchDetail = useCallback(async (id: string) => {
    setLoading(true);
    setError(false);
    try {
      const data = await getTemplate(id);
      setDetail(data);
      setIsFavorited(Boolean((data as Template & { isFavorited?: boolean }).isFavorited));
      // 拉取相关推荐（同平台）
      try {
        const res = await listTemplates({
          platform: data.platform || undefined,
          page: 1,
          pageSize: 10,
          sortBy: 'heat',
        });
        setRelated((res?.data?.list || []).filter((t) => t.id !== id).slice(0, 6));
      } catch {
        setRelated([]);
      }
    } catch (err) {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (templateId) {
      fetchDetail(templateId);
    } else {
      setError(true);
      setLoading(false);
    }
  }, [templateId, fetchDetail]);

  /** 收藏切换：乐观更新 + 失败回滚 */
  const handleFavorite = useCallback(async () => {
    if (!detail || favoriting) return;
    const prev = isFavorited;
    setIsFavorited(!prev);
    setFavoriting(true);
    try {
      if (prev) await unfavoriteTemplate(detail.id);
      else await favoriteTemplate(detail.id);
      Taro.showToast({
        title: prev ? '已取消收藏' : '已收藏',
        icon: 'none',
        duration: 1000,
      });
    } catch (err) {
      setIsFavorited(prev);
      Taro.showToast({ title: '操作失败，已回滚', icon: 'none' });
    } finally {
      setFavoriting(false);
    }
  }, [detail, isFavorited, favoriting]);

  /** 返回上一页 */
  const handleBack = useCallback(() => {
    Taro.navigateBack({ delta: 1 }).catch(() => {
      Taro.switchTab({ url: '/pages/recommend/index' });
    });
  }, []);

  /** 基于此模板创作 → workbench 文本生成 */
  const handleCreate = useCallback(() => {
    if (!detail) return;
    Taro.navigateTo({
      url: `/pages/workbench/text/index?templateId=${detail.id}`,
    });
  }, [detail]);

  /** 跳转到相关推荐详情 */
  const handleRelatedClick = useCallback((id: string) => {
    Taro.redirectTo({
      url: `/pages/template/detail/index?templateId=${id}`,
    });
  }, []);

  if (loading) {
    return (
      <View className='tpl-detail'>
        <LoadingState fullScreen />
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View className='tpl-detail'>
        <View className='tpl-detail__nav'>
          <Text className='tpl-detail__back' onClick={handleBack}>←</Text>
          <Text className='tpl-detail__nav-title'>模板详情</Text>
        </View>
        <ErrorState
          title='加载失败'
          description='模板不存在或加载失败'
          onRetry={() => fetchDetail(templateId)}
        />
      </View>
    );
  }

  // 视频 src 兜底：必须 https，否则不渲染 Video
  const videoSrc =
    detail.videoUrl && /^https:\/\//i.test(detail.videoUrl) ? detail.videoUrl : '';
  const platformLabel = detail.platform
    ? PLATFORM_LABEL[detail.platform] || detail.platform
    : '';

  return (
    <View className='tpl-detail'>
      {/* -------------------- 顶部导航 -------------------- */}
      <View className='tpl-detail__nav'>
        <Text className='tpl-detail__back' onClick={handleBack}>←</Text>
        <Text className='tpl-detail__nav-title'>{detail.title}</Text>
        <Text
          className={`tpl-detail__nav-fav ${isFavorited ? 'tpl-detail__nav-fav--on' : ''}`}
          onClick={handleFavorite}
        >
          {isFavorited ? '♥' : '♡'}
        </Text>
      </View>

      <ScrollView className='tpl-detail__scroll' scrollY>
        {/* -------------------- 视频播放区 -------------------- */}
        <View className='tpl-detail__video'>
          {videoSrc ? (
            <Video
              className='tpl-detail__video-el'
              src={videoSrc}
              controls
              autoplay={false}
              poster={detail.coverUrl || undefined}
              showCenterPlayBtn
              showPlayBtn
              objectFit='cover'
            />
          ) : detail.coverUrl ? (
            <Image
              className='tpl-detail__video-cover'
              src={detail.coverUrl}
              mode='aspectFill'
            />
          ) : (
            <View className='tpl-detail__video-placeholder'>
              <Text>暂无预览视频</Text>
            </View>
          )}
        </View>

        {/* -------------------- 信息区 -------------------- */}
        <View className='tpl-detail__info'>
          <Text className='tpl-detail__title'>{detail.title}</Text>

          <View className='tpl-detail__author'>
            {platformLabel ? (
              <View className='tpl-detail__platform'>
                <Text>{platformLabel}</Text>
              </View>
            ) : null}
            {detail.author ? (
              <Text className='tpl-detail__author-name'>@{detail.author}</Text>
            ) : null}
          </View>

          <View className='tpl-detail__stats'>
            <View className='tpl-detail__stat'>
              <Text className='tpl-detail__stat-label'>播放量</Text>
              <Text className='tpl-detail__stat-value'>
                {formatPlay(detail.playCount)}
              </Text>
            </View>
            <View className='tpl-detail__stat'>
              <Text className='tpl-detail__stat-label'>IQ 值</Text>
              <Text className='tpl-detail__stat-value tpl-detail__stat-value--accent'>
                {detail.iqScore ?? '--'}
              </Text>
            </View>
            <View className='tpl-detail__stat'>
              <Text className='tpl-detail__stat-label'>热度</Text>
              <Text className='tpl-detail__stat-value'>{detail.heat ?? 0}</Text>
            </View>
          </View>

          {detail.tags && detail.tags.length > 0 ? (
            <View className='tpl-detail__tags'>
              {detail.tags.map((tag) => (
                <View key={tag} className='tpl-detail__tag'>
                  <Text>#{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {detail.description ? (
            <View className='tpl-detail__desc'>
              <Text>{detail.description}</Text>
            </View>
          ) : null}
        </View>

        {/* -------------------- 操作区 -------------------- */}
        <View className='tpl-detail__actions'>
          <View className='tpl-detail__btn tpl-detail__btn--primary' onClick={handleCreate}>
            <Text>基于此模板创作</Text>
          </View>
          <View
            className={`tpl-detail__btn ${
              isFavorited ? 'tpl-detail__btn--ghost' : 'tpl-detail__btn--outline'
            }`}
            onClick={handleFavorite}
          >
            <Text>{isFavorited ? '已收藏 ♥' : '收藏 ♡'}</Text>
          </View>
        </View>

        {/* -------------------- 相关推荐 -------------------- */}
        {related.length > 0 ? (
          <View className='tpl-detail__related'>
            <View className='tpl-detail__related-header'>
              <Text className='tpl-detail__related-title'>相关推荐</Text>
            </View>
            <ScrollView className='tpl-detail__related-scroll' scrollX showScrollbar={false}>
              {related.map((t) => (
                <View
                  key={t.id}
                  className='tpl-detail__related-item'
                  onClick={() => handleRelatedClick(t.id)}
                >
                  {t.coverUrl ? (
                    <Image
                      className='tpl-detail__related-cover'
                      src={t.coverUrl}
                      mode='aspectFill'
                      lazyLoad
                    />
                  ) : (
                    <View className='tpl-detail__related-cover tpl-detail__related-cover--placeholder'>
                      <Text>模板</Text>
                    </View>
                  )}
                  <Text className='tpl-detail__related-name'>{t.title}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
