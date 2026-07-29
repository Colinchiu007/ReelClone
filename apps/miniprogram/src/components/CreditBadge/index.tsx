import { View, Text } from '@tarojs/components';
import './index.scss';

/**
 * CreditBadge 积分徽章
 * 渐变背景 + 积分图标 + 数字，用于套餐/积分展示
 */

export interface CreditBadgeProps {
  amount: number;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

function formatAmount(n: number): string {
  if (n >= 1000) {
    const v = n / 1000;
    return v % 1 === 0 ? `${v}k+` : `${v.toFixed(1)}k+`;
  }
  return String(n);
}

export default function CreditBadge({
  amount,
  size = 'md',
  showIcon = true,
}: CreditBadgeProps) {
  return (
    <View className={`credit-badge credit-badge--${size}`}>
      {showIcon ? <Text className='credit-badge__icon'>✦</Text> : null}
      <Text className='credit-badge__amount'>{formatAmount(amount)}</Text>
    </View>
  );
}
