/**
 * 我的订单页
 * 对应 FR10_套餐积分_04_我的订单
 *
 * - 筛选：全部 / 待支付 / 已支付 / 已取消
 * - 列表：每条订单显示 订单号、套餐名、金额、状态、创建时间
 *   待支付订单：去支付 + 取消按钮
 *   已支付：查看详情
 * - 调用 order.api.listOrders({ status, page, pageSize: 20 })
 *
 * Order.status：PENDING(待支付) / PAID(已支付) / CANCELLED(已取消) / REFUNDED(已退款)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { LoadingState, ErrorState, EmptyState } from '@/components';
import { usePointsStore } from '@/stores/points.store';
import { listOrders, cancelOrder, createOrder } from '@/services/api/order.api';
import type { Order } from '@/types';
import './index.scss';

/** 筛选 Tab 项 */
interface FilterTab {
  key: string;
  label: string;
}

const FILTER_TABS: FilterTab[] = [
  { key: '', label: '全部' },
  { key: 'PENDING', label: '待支付' },
  { key: 'PAID', label: '已支付' },
  { key: 'CANCELLED', label: '已取消' },
];

/** 状态 → 显示文本 / 样式类名 */
const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING: { label: '待支付', cls: 'pending' },
  PAID: { label: '已支付', cls: 'paid' },
  CANCELLED: { label: '已取消', cls: 'cancelled' },
  REFUNDED: { label: '已退款', cls: 'refunded' },
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

export default function OrdersPage() {
  const [list, setList] = useState<Order[]>([]);
  const [activeStatus, setActiveStatus] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const listRef = useRef<Order[]>([]);

  const recharge = usePointsStore((s) => s.recharge);

  /** 加载第一页 */
  const loadFirstPage = useCallback(async (status: string) => {
    setLoading(true);
    setError(false);
    try {
      const res = await listOrders({ status: status || undefined, page: 1, pageSize: PAGE_SIZE });
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
  }, []);

  /** 切换筛选 */
  const handleTabChange = useCallback(
    (status: string) => {
      if (status === activeStatus) return;
      setActiveStatus(status);
      loadFirstPage(status);
    },
    [activeStatus, loadFirstPage],
  );

  /** 上拉加载更多 */
  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await listOrders({
        status: activeStatus || undefined,
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
  }, [loadingMore, hasMore, page, activeStatus]);

  /** 待支付订单：去支付（创建新支付参数 → 调起微信支付） */
  const handlePay = useCallback(
    async (order: Order) => {
      if (actioningId) return;
      setActioningId(order.id);
      try {
        // 重新创建订单支付参数（后端幂等：相同 packageId + 未支付订单复用）
        const { paymentParams } = await createOrder(order.packageId);
        await Taro.requestPayment({
          timeStamp: paymentParams.timeStamp,
          nonceStr: paymentParams.nonceStr,
          package: paymentParams.package,
          signType: paymentParams.signType,
          paySign: paymentParams.paySign,
        });
        recharge(order.pointAmount);
        Taro.showToast({ title: '支付成功', icon: 'success' });
        // 刷新当前列表
        loadFirstPage(activeStatus);
      } catch (err) {
        const errMsg = (err as { errMsg?: string })?.errMsg || '';
        if (errMsg.includes('cancel')) {
          Taro.showToast({ title: '已取消支付', icon: 'none' });
        } else {
          Taro.showToast({ title: '支付失败，请重试', icon: 'none' });
        }
      } finally {
        setActioningId(null);
      }
    },
    [actioningId, activeStatus, loadFirstPage, recharge],
  );

  /** 待支付订单：取消订单 */
  const handleCancel = useCallback(
    async (order: Order) => {
      if (actioningId) return;
      const confirmRes = await Taro.showModal({
        title: '提示',
        content: '确定要取消该订单吗？',
      });
      if (!confirmRes.confirm) return;
      setActioningId(order.id);
      try {
        await cancelOrder(order.id);
        Taro.showToast({ title: '已取消', icon: 'success' });
        loadFirstPage(activeStatus);
      } catch (e) {
        Taro.showToast({ title: '取消失败', icon: 'none' });
      } finally {
        setActioningId(null);
      }
    },
    [actioningId, activeStatus, loadFirstPage],
  );

  /** 已支付订单：查看详情（Toast 提示，无独立详情页） */
  const handleViewDetail = useCallback((order: Order) => {
    Taro.showToast({
      title: `订单 ${order.orderNo}`,
      icon: 'none',
      duration: 2000,
    });
  }, []);

  /** 页面显示时刷新（从订阅页返回后保持最新） */
  useDidShow(() => {
    if (!loading) {
      loadFirstPage(activeStatus);
    }
  });

  useEffect(() => {
    loadFirstPage('');
  }, [loadFirstPage]);

  return (
    <View className='orders-page'>
      {/* 筛选 Tab */}
      <View className='orders-page__tabs'>
        {FILTER_TABS.map((tab) => (
          <View
            key={tab.key}
            className={`orders-page__tab ${activeStatus === tab.key ? 'orders-page__tab--on' : ''}`}
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
          description='订单列表获取失败，请重试'
          onRetry={() => loadFirstPage(activeStatus)}
        />
      ) : list.length === 0 ? (
        <EmptyState title='暂无订单' description='还没有订单记录' icon='🧾' />
      ) : (
        <ScrollView
          scrollY
          className='orders-page__scroll'
          onScrollToLower={handleLoadMore}
          lowerThreshold={100}
        >
          {list.map((order) => {
            const meta = STATUS_META[order.status] || { label: order.status, cls: 'pending' };
            return (
              <View key={order.id} className='order-card'>
                <View className='order-card__head'>
                  <Text className='order-card__no'>订单号：{order.orderNo}</Text>
                  <Text className={`order-card__status order-card__status--${meta.cls}`}>
                    {meta.label}
                  </Text>
                </View>

                <View className='order-card__body'>
                  <View className='order-card__row'>
                    <Text className='order-card__label'>套餐</Text>
                    <Text className='order-card__value'>
                      {order.pointAmount.toLocaleString()} 积分包
                    </Text>
                  </View>
                  <View className='order-card__row'>
                    <Text className='order-card__label'>金额</Text>
                    <Text className='order-card__value order-card__value--price'>
                      ¥{order.amount}
                    </Text>
                  </View>
                  <View className='order-card__row'>
                    <Text className='order-card__label'>创建时间</Text>
                    <Text className='order-card__value'>{formatDateTime(order.createdAt)}</Text>
                  </View>
                </View>

                {/* 操作按钮区 */}
                {order.status === 'PENDING' ? (
                  <View className='order-card__actions'>
                    <View
                      className={`order-card__btn order-card__btn--ghost ${
                        actioningId === order.id ? 'order-card__btn--disabled' : ''
                      }`}
                      onClick={() => handleCancel(order)}
                    >
                      <Text>取消</Text>
                    </View>
                    <View
                      className={`order-card__btn order-card__btn--primary ${
                        actioningId === order.id ? 'order-card__btn--disabled' : ''
                      }`}
                      onClick={() => handlePay(order)}
                    >
                      <Text>{actioningId === order.id ? '处理中...' : '去支付'}</Text>
                    </View>
                  </View>
                ) : order.status === 'PAID' ? (
                  <View className='order-card__actions'>
                    <View
                      className='order-card__btn order-card__btn--ghost'
                      onClick={() => handleViewDetail(order)}
                    >
                      <Text>查看详情</Text>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}

          {/* 加载更多 / 没有更多 */}
          <View className='orders-page__footer'>
            {loadingMore ? (
              <Text className='orders-page__footer-text'>加载中...</Text>
            ) : hasMore ? (
              <Text className='orders-page__footer-text'>上拉加载更多</Text>
            ) : (
              <Text className='orders-page__footer-text'>没有更多了</Text>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
