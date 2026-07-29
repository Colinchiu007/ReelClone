/**
 * 订阅计划页
 * 对应 FR10_套餐积分_01_订阅计划
 *
 * - 顶部：当前积分余额（大字体）
 * - 套餐列表：调用 order.api.listPackages()
 *   每个套餐卡片：名称、价格、原价（划线）、积分数量、赠送积分、有效期
 *   突出推荐套餐，渐变背景区分
 * - 购买按钮：createOrder(packageId) → Taro.requestPayment 调起微信支付
 *   支付成功：Toast + 跳转我的套餐
 *   支付失败：Toast 错误
 */
import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { CreditBadge, LoadingState, ErrorState, EmptyState } from '@/components';
import { useCredits } from '@/hooks/useCredits';
import { usePointsStore } from '@/stores/points.store';
import { listPackages, createOrder } from '@/services/api/order.api';
import type { Package } from '@/types';
import './index.scss';

/** 渐变背景数组（用于区分不同套餐卡片） */
const PACKAGE_GRADIENTS = [
  'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
  'linear-gradient(135deg, #F093FB 0%, #F5576C 100%)',
  'linear-gradient(135deg, #43E97B 0%, #38F9D7 100%)',
  'linear-gradient(135deg, #FA709A 0%, #FEE140 100%)',
  'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
];

/** 格式化有效期天数 */
function formatDuration(days: number): string {
  if (days >= 365 && days % 365 === 0) return `${days / 365} 年`;
  if (days >= 30 && days % 30 === 0) return `${days / 30} 个月`;
  return `${days} 天`;
}

export default function SubscribePage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  const { balance, refresh } = useCredits(false);
  const recharge = usePointsStore((s) => s.recharge);

  /** 加载套餐列表 + 积分余额 */
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [list] = await Promise.all([
        listPackages(),
        refresh().catch(() => null),
      ]);
      setPackages(list || []);
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /** 购买套餐：创建订单 → 调起微信支付 */
  const handlePurchase = useCallback(
    async (pkg: Package) => {
      if (purchasingId) return;
      setPurchasingId(pkg.id);
      try {
        // 1. 创建订单，获取支付参数
        const { paymentParams } = await createOrder(pkg.id);

        // 2. 调起微信支付
        await Taro.requestPayment({
          timeStamp: paymentParams.timeStamp,
          nonceStr: paymentParams.nonceStr,
          package: paymentParams.package,
          signType: paymentParams.signType,
          paySign: paymentParams.paySign,
        });

        // 3. 支付成功：乐观更新积分 + Toast + 跳转我的套餐
        recharge(pkg.pointAmount + pkg.bonusPoints);
        Taro.showToast({ title: '支付成功', icon: 'success' });
        setTimeout(() => {
          Taro.navigateTo({ url: '/pages/billing/my-package/index' });
        }, 1200);
      } catch (err) {
        const errMsg = (err as { errMsg?: string })?.errMsg || '';
        if (errMsg.includes('cancel')) {
          Taro.showToast({ title: '已取消支付', icon: 'none' });
        } else {
          Taro.showToast({ title: '支付失败，请重试', icon: 'none' });
        }
      } finally {
        setPurchasingId(null);
      }
    },
    [purchasingId, recharge],
  );

  if (loading) {
    return (
      <View className='subscribe-page'>
        <LoadingState title='加载套餐中...' />
      </View>
    );
  }

  if (error) {
    return (
      <View className='subscribe-page'>
        <ErrorState title='加载失败' description='套餐信息获取失败，请重试' onRetry={loadData} />
      </View>
    );
  }

  return (
    <View className='subscribe-page'>
      <ScrollView scrollY className='subscribe-page__scroll'>
        {/* 顶部：当前积分余额 */}
        <View className='subscribe-page__balance'>
          <Text className='subscribe-page__balance-label'>当前积分余额</Text>
          <Text className='subscribe-page__balance-num'>{balance.toLocaleString()}</Text>
          <View className='subscribe-page__balance-badge'>
            <CreditBadge amount={balance} size='sm' />
          </View>
        </View>

        {/* 套餐列表 */}
        {packages.length === 0 ? (
          <EmptyState title='暂无套餐' description='请稍后再来查看' icon='📦' />
        ) : (
          <View className='subscribe-page__list'>
            {packages.map((pkg, idx) => {
              const isHot = pkg.code === 'POPULAR' || idx === 1;
              const gradient = PACKAGE_GRADIENTS[idx % PACKAGE_GRADIENTS.length];
              return (
                <View
                  key={pkg.id}
                  className={`pkg-card ${isHot ? 'pkg-card--hot' : ''}`}
                  style={{ background: isHot ? gradient : undefined }}
                >
                  {isHot ? <View className='pkg-card__tag'>🔥 热门推荐</View> : null}
                  <View className='pkg-card__head'>
                    <Text className='pkg-card__name'>{pkg.name}</Text>
                    {pkg.durationDays > 0 ? (
                      <Text className='pkg-card__duration'>
                        {formatDuration(pkg.durationDays)}有效期
                      </Text>
                    ) : null}
                  </View>

                  <View className='pkg-card__points'>
                    <Text className='pkg-card__points-num'>
                      {(pkg.pointAmount + pkg.bonusPoints).toLocaleString()}
                    </Text>
                    <Text className='pkg-card__points-unit'>积分</Text>
                  </View>

                  {pkg.bonusPoints > 0 ? (
                    <Text className='pkg-card__bonus'>
                      含 {pkg.pointAmount.toLocaleString()} 基础 + {pkg.bonusPoints.toLocaleString()} 赠送
                    </Text>
                  ) : null}

                  {pkg.description ? (
                    <Text className='pkg-card__desc'>{pkg.description}</Text>
                  ) : null}

                  <View className='pkg-card__footer'>
                    <View className='pkg-card__price-wrap'>
                      <Text className='pkg-card__price'>¥{pkg.price}</Text>
                      {pkg.originalPrice && pkg.originalPrice > pkg.price ? (
                        <Text className='pkg-card__origin'>¥{pkg.originalPrice}</Text>
                      ) : null}
                    </View>
                    <View
                      className={`pkg-card__buy ${
                        purchasingId === pkg.id ? 'pkg-card__buy--disabled' : ''
                      }`}
                      onClick={() => handlePurchase(pkg)}
                    >
                      <Text>{purchasingId === pkg.id ? '支付中...' : '立即购买'}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
