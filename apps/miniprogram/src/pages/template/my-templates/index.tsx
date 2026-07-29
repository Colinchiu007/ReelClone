/**
 * 我的模板页（template 分包）
 * 对应 FR9 - 我的模板
 *
 * 功能（MVP）：
 *  - Tab：收藏 / 历史（历史暂未实现，仅展示收藏）
 *  - 列表：使用 TemplateCard，调用 listFavorites
 *  - 空状态：EmptyState "还没有收藏任何模板"
 *  - 上拉加载更多（useReachBottom）
 *  - 点击跳转模板详情
 *  - 收藏取消：乐观更新 + 失败回滚 + 列表移除
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useReachBottom } from '@tarojs/taro';
import { TemplateCard, EmptyState, LoadingState, ErrorState } from '@/components';
import {
  favoriteTemplate,
  listFavorites,
  unfavoriteTemplate,
} from '@/services/api/template.api';
import type { Template } from '@/types';
import './index.scss';

type TabKey = 'favorites' | 'history';
const PAGE_SIZE = 20;

interface MyItem extends Template {
  isFavorited?: boolean;
}

export default function MyTemplatesPage() {
  const [tab, setTab] = useState<TabKey>('favorites');
  const [list, setList] = useState<MyItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(false);

  /** 拉取收藏列表 */
  const fetchList = useCallback(async (pageNum: number, replace: boolean) => {
    if (replace) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(false);
    try {
      const res = await listFavorites({ page: pageNum, pageSize: PAGE_SIZE });
      const items = ((res?.data?.list || []) as MyItem[]).map((t) => ({
        ...t,
        isFavorited: true,
      }));
      setList((prev) => (replace ? items : [...prev, ...items]));
      setHasMore(items.length >= PAGE_SIZE);
      setPage(pageNum);
    } catch (err) {
      setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // 首次加载 + Tab 切换刷新
  useEffect(() => {
    if (tab === 'favorites') {
      fetchList(1, true);
    } else {
      // 历史 Tab：MVP 阶段不实现，置空列表
      setList([]);
      setHasMore(false);
    }
  }, [tab, fetchList]);

  // 上拉加载更多
  useReachBottom(() => {
    if (tab !== 'favorites') return;
    if (!loading && !loadingMore && hasMore && !error) {
      fetchList(page + 1, false);
    }
  });

  /** 取消收藏：乐观更新 + 失败回滚，成功后从列表移除 */
  const handleFavorite = useCallback(
    async (id: string, next: boolean) => {
      // 在"我的模板"中，next=false 表示取消收藏，需从列表移除
      if (next) return; // 在已收藏列表中不响应"再收藏"
      const snapshot = list;
      setList((prev) => prev.filter((t) => t.id !== id));
      try {
        await unfavoriteTemplate(id);
        Taro.showToast({ title: '已取消收藏', icon: 'none', duration: 1000 });
      } catch (err) {
        setList(snapshot);
        Taro.showToast({ title: '操作失败，已回滚', icon: 'none' });
      }
    },
    [list],
  );

  /** 点击卡片跳转详情 */
  const handleCardClick = useCallback((id: string) => {
    Taro.navigateTo({ url: `/pages/template/detail/index?templateId=${id}` });
  }, []);

  // 瀑布流双列
  const leftColumn = list.filter((_, i) => i % 2 === 0);
  const rightColumn = list.filter((_, i) => i % 2 === 1);

  const renderCard = (t: MyItem) => (
    <View key={t.id} className='my-tpl__item'>
      <TemplateCard
        template={{
          id: t.id,
          title: t.title,
          coverUrl: t.coverUrl,
          platform: t.platform,
          author: t.author,
          playCount: t.playCount,
          iqScore: t.iqScore,
          isFavorited: t.isFavorited,
        }}
        onClick={handleCardClick}
        onFavorite={handleFavorite}
      />
    </View>
  );

  return (
    <View className='my-tpl'>
      {/* -------------------- Tab -------------------- */}
      <View className='my-tpl__tabs'>
        <View
          className={`my-tpl__tab ${tab === 'favorites' ? 'my-tpl__tab--on' : ''}`}
          onClick={() => setTab('favorites')}
        >
          <Text>收藏</Text>
        </View>
        <View
          className={`my-tpl__tab ${tab === 'history' ? 'my-tpl__tab--on' : ''}`}
          onClick={() => setTab('history')}
        >
          <Text>历史</Text>
        </View>
      </View>

      {/* -------------------- 列表 -------------------- */}
      <View className='my-tpl__list'>
        {tab === 'history' ? (
          <EmptyState
            title='历史功能即将上线'
            description='浏览过的模板将在这里展示'
            icon='🕒'
          />
        ) : loading && list.length === 0 ? (
          <LoadingState />
        ) : error && list.length === 0 ? (
          <ErrorState onRetry={() => fetchList(1, true)} />
        ) : list.length === 0 ? (
          <EmptyState
            title='还没有收藏任何模板'
            description='去灵感广场发现更多灵感吧'
            icon='📭'
          />
        ) : (
          <View className='my-tpl__waterfall'>
            <View className='my-tpl__col'>{leftColumn.map(renderCard)}</View>
            <View className='my-tpl__col'>{rightColumn.map(renderCard)}</View>
          </View>
        )}

        {loadingMore ? (
          <View className='my-tpl__status'>
            <Text>加载中...</Text>
          </View>
        ) : null}
        {!loadingMore && !hasMore && list.length > 0 ? (
          <View className='my-tpl__status'>
            <Text>已经到底啦</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
