/**
 * useCredits —— 积分 Hook
 *
 * 返回：
 *  - balance    可用积分余额
 *  - frozen     冻结积分
 *  - total      累计积分
 *  - refresh    从服务端刷新余额
 *  - consume    扣减积分（乐观更新）
 *  - recharge   增加积分（乐观更新）
 *
 * autoFetch=true 时自动从服务端拉取最新余额。
 */
import { useEffect, useCallback } from 'react';
import { usePointsStore } from '@/stores/points.store';
import { getBalance } from '@/services/api/billing.api';

export function useCredits(autoFetch = true) {
  const { balance, frozen, total, setBalance, consume, recharge } = usePointsStore();

  /** 从服务端刷新积分余额 */
  const refresh = useCallback(async () => {
    const bal = await getBalance();
    setBalance({ balance: bal.balance, frozen: bal.frozen, total: bal.total });
    return bal;
  }, [setBalance]);

  useEffect(() => {
    if (autoFetch) {
      refresh().catch(() => {
        // 静默失败：未登录或网络异常时不影响页面渲染
      });
    }
  }, [autoFetch, refresh]);

  return { balance, frozen, total, refresh, consume, recharge };
}
