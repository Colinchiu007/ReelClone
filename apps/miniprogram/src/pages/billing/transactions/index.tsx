/**
 * 消费记录页
 * 对应 FR10_套餐积分_03_消费记录
 *
 * - 筛选：全部 / 充值 / 消费 / 冻结 / 释放
 * - 列表：每条记录显示 类型图标 + 描述 / 金额（+绿/-红）/ 余额变化 / 时间
 * - 调用 billing.api.listTransactions({ type, page, pageSize: 20 })
 * - 上拉加载更多
 *
 * PointTransaction.type 取值：RECHARGE(充值) / CONSUME(消费) / FREEZE(冻结) / RELEASE(释放) / GRANT(赠送)
 * direction：IN(增加) / OUT(减少)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { LoadingState, ErrorState, EmptyState } from '@/components';
import { listTransactions } from '@/services/api/billing.api';
import type { PointTransaction } from '@/types';
import './index.scss';

/** 筛选 Tab 项 */
interface FilterTab {
  key: string;
  label: string;
}

const FILTER_TABS: FilterTab[] = [
  { key: '', label: '全部' },
  { key: 'RECHARGE', label: '充值' },
  { key: 'CONSUME', label: '消费' },
  { key: 'FREEZE', label: '冻结' },
  { key: 'RELEASE', label: '释放' },
];

/** 类型 → 图标 / 标签 映射 */
const TYPE_META: Record<string, { icon: string; label: string }> = {
  RECHARGE: { icon: '💰', label: '充值' },
  CONSUME: { icon: '🎬', label: '消费' },
  FREEZE: { icon: '❄️', label: '冻结' },
  RELEASE: { icon: '🔓', label: '释放' },
  GRANT: { icon: '🎁', label: '赠送' },
};

const PAGE_SIZE = 20;

/** 格式化时间：YYYY-MM-DD HH:mm */
function formatDateTime(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

export default function TransactionsPage() {
  const [list, setList] = useState<PointTransaction[]>([]);
  const [activeType, setActiveType] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const listRef = useRef<PointTransaction[]>([]);

  /** 加载第一页 */
  const loadFirstPage = useCallback(
    async (type: string) => {
      setLoading(true);
      setError(false);
      try {
        const res = await listTransactions({ type: type || undefined, page: 1, pageSize: PAGE_SIZE });
        const newList = res?.data?.list || [];
        listRef.current = newList;
        setList(newList);
        setPage(1);
        setHasMore(newList.length >= PAGE_SIZE);
      } catch (e) {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /** 切换筛选 */
  const handleTabChange = useCallback(
    (type: string) => {
      if (type === activeType) return;
      setActiveType(type);
      loadFirstPage(type);
    },
    [activeType, loadFirstPage],
  );

  /** 上拉加载更多 */
  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await listTransactions({
        type: activeType || undefined,
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      const newList = res?.data?.list || [];
      const merged = [...listRef.current, ...newList];
      listRef.current = merged;
      setList(merged);
      setPage(nextPage);
      setHasMore(newList.length >= PAGE_SIZE);
    } catch (e) {
      Taro.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, activeType]);

  useEffect(() => {
    loadFirstPage('');
  }, [loadFirstPage]);

  return (
    <View className='tx-page'>
      {/* 筛选 Tab */}
      <View className='tx-page__tabs'>
        {FILTER_TABS.map((tab) => (
          <View
            key={tab.key}
            className={`tx-page__tab ${activeType === tab.key ? 'tx-page__tab--on' : ''}`}
            onClick={() => handleTabChange(tab.key)}
          >
            <Text>{tab.label}</Text>
          </View>
        ))}
      </View>

      {/* 列表区域 */}
      {loading ? (
        <LoadingState title='加载中...' />
      ) : error ? (
        <ErrorState
          title='加载失败'
          description='消费记录获取失败，请重试'
          onRetry={() => loadFirstPage(activeType)}
        />
      ) : list.length === 0 ? (
        <EmptyState title='暂无记录' description='还没有积分变动记录' icon='📊' />
      ) : (
        <ScrollView
          scrollY
          className='tx-page__scroll'
          onScrollToLower={handleLoadMore}
          lowerThreshold={100}
        >
          {list.map((tx) => {
            const meta = TYPE_META[tx.type] || { icon: '📝', label: tx.type };
            const isIncome = tx.direction === 'IN';
            return (
              <View key={tx.id} className='tx-item'>
                <View className={`tx-item__icon tx-item__icon--${tx.direction.toLowerCase()}`}>
                  <Text>{meta.icon}</Text>
                </View>
                <View className='tx-item__main'>
                  <View className='tx-item__head'>
                    <Text className='tx-item__label'>{meta.label}</Text>
                    <Text className='tx-item__desc'>{tx.description || '-'}</Text>
                  </View>
                  <Text className='tx-item__time'>{formatDateTime(tx.createdAt)}</Text>
                </View>
                <View className='tx-item__right'>
                  <Text className={`tx-item__amount tx-item__amount--${isIncome ? 'in' : 'out'}`}>
                    {isIncome ? '+' : '-'}
                    {Math.abs(tx.amount).toLocaleString()}
                  </Text>
                  <Text className='tx-item__balance'>余额 {tx.balance.toLocaleString()}</Text>
                </View>
              </View>
            );
          })}

          {/* 加载更多 / 没有更多 */}
          <View className='tx-page__footer'>
            {loadingMore ? (
              <Text className='tx-page__footer-text'>加载中...</Text>
            ) : hasMore ? (
              <Text className='tx-page__footer-text'>上拉加载更多</Text>
            ) : (
              <Text className='tx-page__footer-text'>没有更多了</Text>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
