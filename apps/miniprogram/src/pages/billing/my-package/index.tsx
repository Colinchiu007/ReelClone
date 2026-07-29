/**
 * 我的套餐页
 * 对应 FR10_套餐积分_02_我的套餐
 *
 * - 当前套餐卡片：套餐名、剩余积分、总积分、有效期
 * - 积分进度条：剩余 / 总积分
 * - 历史套餐列表（已过期的）
 *
 * 数据来源：
 *  - 积分余额：billing.api.getBalance() → balance / total
 *  - 历史套餐：order.api.listOrders({ status: 'PAID' }) 反推
 */
import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { LoadingState, ErrorState, EmptyState } from '@/components';
import { useCredits } from '@/hooks/useCredits';
import { listOrders } from '@/services/api/order.api';
import type { Order } from '@/types';
import './index.scss';

/** 格式化时间戳为 YYYY-MM-DD */
function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 计算订单剩余有效天数（基于创建时间 + 30 天默认有效期） */
function calcRemainingDays(order: Order, durationDays = 30): number {
  const created = new Date(order.createdAt).getTime();
  const expire = created + durationDays * 24 * 3600 * 1000;
  const diff = expire - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 3600 * 1000)));
}

/** 判断订单是否已过期（基于创建时间 + 30 天） */
function isExpired(order: Order, durationDays = 30): boolean {
  return calcRemainingDays(order, durationDays) <= 0;
}

export default function MyPackagePage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { balance, total, refresh } = useCredits(false);

  /** 加载订单列表 + 积分余额 */
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [paidRes] = await Promise.all([
        listOrders({ status: 'PAID', page: 1, pageSize: 50 }),
        refresh().catch(() => null),
      ]);
      const paidOrders = paidRes?.data?.list || [];
      // 按创建时间倒序
      paidOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setOrders(paidOrders);
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 拆分当前套餐（未过期）与历史套餐（已过期）
  const activeOrders = orders.filter((o) => !isExpired(o));
  const expiredOrders = orders.filter((o) => isExpired(o));

  // 当前主套餐取第一个未过期订单
  const currentOrder = activeOrders[0];
  // 进度条百分比：剩余积分 / 总积分
  const progressPercent = total > 0 ? Math.round((balance / total) * 100) : 0;

  if (loading) {
    return (
      <View className='my-pkg'>
        <LoadingState title='加载中...' />
      </View>
    );
  }

  if (error) {
    return (
      <View className='my-pkg'>
        <ErrorState title='加载失败' description='套餐信息获取失败，请重试' onRetry={loadData} />
      </View>
    );
  }

  return (
    <View className='my-pkg'>
      <ScrollView scrollY className='my-pkg__scroll'>
        {/* 当前套餐卡片 */}
        {currentOrder ? (
          <View className='my-pkg__current'>
            <View className='my-pkg__current-head'>
              <View className='my-pkg__current-label'>
                <Text className='my-pkg__current-title'>当前套餐</Text>
                <Text className='my-pkg__current-status'>使用中</Text>
              </View>
              <Text className='my-pkg__current-name'>
                {currentOrder.pointAmount.toLocaleString()} 积分包
              </Text>
            </View>

            <View className='my-pkg__points-grid'>
              <View className='my-pkg__points-item'>
                <Text className='my-pkg__points-val'>{balance.toLocaleString()}</Text>
                <Text className='my-pkg__points-key'>剩余积分</Text>
              </View>
              <View className='my-pkg__points-divider' />
              <View className='my-pkg__points-item'>
                <Text className='my-pkg__points-val'>{total.toLocaleString()}</Text>
                <Text className='my-pkg__points-key'>总积分</Text>
              </View>
              <View className='my-pkg__points-divider' />
              <View className='my-pkg__points-item'>
                <Text className='my-pkg__points-val'>{calcRemainingDays(currentOrder)}</Text>
                <Text className='my-pkg__points-key'>剩余天数</Text>
              </View>
            </View>

            {/* 积分进度条 */}
            <View className='my-pkg__progress'>
              <View className='my-pkg__progress-bar'>
                <View
                  className='my-pkg__progress-fill'
                  style={{ width: `${progressPercent}%` }}
                />
              </View>
              <View className='my-pkg__progress-text'>
                <Text>已使用 {total - balance} 积分</Text>
                <Text>{progressPercent}%</Text>
              </View>
            </View>

            <View className='my-pkg__expire'>
              <Text>有效期至 {formatDate(currentOrder.createdAt)} 起算 30 天</Text>
            </View>
          </View>
        ) : (
          <View className='my-pkg__empty-current'>
            <EmptyState
              title='暂无可用套餐'
              description='去订阅计划购买套餐，获取更多积分'
              icon='🎁'
            />
            <View
              className='my-pkg__go-subscribe'
              onClick={() => Taro.navigateTo({ url: '/pages/billing/subscribe/index' })}
            >
              <Text>去订阅</Text>
            </View>
          </View>
        )}

        {/* 历史套餐列表 */}
        <View className='my-pkg__section'>
          <Text className='my-pkg__section-title'>历史套餐</Text>
          {expiredOrders.length === 0 ? (
            <View className='my-pkg__empty-history'>
              <Text>暂无历史套餐记录</Text>
            </View>
          ) : (
            <View className='my-pkg__history-list'>
              {expiredOrders.map((order) => (
                <View key={order.id} className='my-pkg__history-item'>
                  <View className='my-pkg__history-info'>
                    <Text className='my-pkg__history-name'>
                      {order.pointAmount.toLocaleString()} 积分包
                    </Text>
                    <Text className='my-pkg__history-date'>
                      {formatDate(order.createdAt)} 购买
                    </Text>
                  </View>
                  <Text className='my-pkg__history-amount'>¥{order.amount}</Text>
                  <Text className='my-pkg__history-status'>已过期</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
