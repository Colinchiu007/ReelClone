/**
 * 设置主页
 * 对应 FR6_设置_01_账户与内容管理 / FR6_设置_02_套餐与积分入口
 *
 * - 分组1 账户：用户 ID（可复制）/ 昵称（修改）/ 手机号（绑定弹窗）/ 修改密码（弹窗）/ 账户角色
 * - 分组2 内容管理：我的资产 / 我的作品 / 我的模板
 * - 分组3 套餐与积分：订阅计划 / 我的套餐 / 消费记录 / 我的订单
 * - 分组4 关于：关于 ReelClone / 隐私协议
 * - 底部：ICP 备案号 + 版本号
 */
import { useState, useCallback } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useAuthStore } from '@/stores/auth.store';
import { useCredits } from '@/hooks/useCredits';
import { updateUser } from '@/services/api/user.api';
import BindMobileModal from './bind-mobile-modal';
import ChangePasswordModal from './change-password-modal';
import './index.scss';

/** 应用版本号（与 about 页保持一致） */
const APP_VERSION = '1.0.0';

/** ICP 备案号 */
const ICP_NUMBER = '粤ICP备2026062569号';

/** 设置项类型 */
type ItemType = 'display' | 'copy' | 'navigate' | 'action';

interface SettingItem {
  label: string;
  value?: string;
  type: ItemType;
  url?: string;
  onClick?: () => void;
  showArrow?: boolean;
}

interface SettingGroup {
  title?: string;
  items: SettingItem[];
}

export default function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const { refresh } = useCredits(false);
  const [bindModalVisible, setBindModalVisible] = useState(false);
  const [pwdModalVisible, setPwdModalVisible] = useState(false);

  /** 复制用户 ID 到剪贴板 */
  const handleCopyUserId = useCallback(() => {
    if (!user?.id) return;
    Taro.setClipboardData({
      data: user.id,
      success: () => {
        Taro.showToast({ title: '已复制用户 ID', icon: 'success' });
      },
    });
  }, [user?.id]);

  /** 修改昵称：使用 showModal editable（微信小程序特有参数，Taro 类型未声明） */
  const handleEditNickname = useCallback(async () => {
    if (!user) return;
    const res = await Taro.showModal({
      title: '修改昵称',
      editable: true,
      content: user.nickname || '',
      placeholderText: '请输入新昵称',
      confirmText: '保存',
    } as Taro.showModal.Option);
    if (!res.confirm) return;
    const newNickname = ((res as { content?: string }).content || '').trim();
    if (!newNickname) {
      Taro.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }
    if (newNickname === user.nickname) return;
    try {
      const updated = await updateUser({ nickname: newNickname });
      setUser(updated);
      Taro.showToast({ title: '修改成功', icon: 'success' });
    } catch (e) {
      // 错误提示已由 request 层处理
    }
  }, [user, setUser]);

  /** 跳转页面 */
  const handleNavigate = useCallback((url: string) => {
    Taro.navigateTo({ url });
  }, []);

  /** 绑定手机号成功回调 */
  const handleBindSuccess = useCallback(() => {
    setBindModalVisible(false);
    // 刷新积分（绑定手机号后可能有赠送）
    refresh().catch(() => null);
  }, [refresh]);

  /** 修改密码成功回调 */
  const handlePwdSuccess = useCallback(() => {
    setPwdModalVisible(false);
  }, []);

  // -------------------- 分组数据 --------------------
  const groups: SettingGroup[] = [
    {
      title: '账户',
      items: [
        {
          label: '用户 ID',
          value: user?.id ? `${user.id.slice(0, 8)}...` : '-',
          type: 'copy',
          onClick: handleCopyUserId,
        },
        {
          label: '昵称',
          value: user?.nickname || '未设置',
          type: 'action',
          onClick: handleEditNickname,
          showArrow: true,
        },
        {
          label: '手机号',
          value: user?.mobile ? user.mobile.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '未绑定',
          type: 'action',
          onClick: () => setBindModalVisible(true),
          showArrow: true,
        },
        {
          label: '修改密码',
          type: 'action',
          onClick: () => setPwdModalVisible(true),
          showArrow: true,
        },
        {
          label: '账户角色',
          value: '普通用户',
          type: 'display',
        },
      ],
    },
    {
      title: '内容管理',
      items: [
        { label: '我的资产', type: 'navigate', url: '/pages/asset/index', showArrow: true },
        { label: '我的作品', type: 'navigate', url: '/pages/workbench/works/index', showArrow: true },
        { label: '我的模板', type: 'navigate', url: '/pages/template/my-templates/index', showArrow: true },
      ],
    },
    {
      title: '套餐与积分',
      items: [
        { label: '订阅计划', type: 'navigate', url: '/pages/billing/subscribe/index', showArrow: true },
        { label: '我的套餐', type: 'navigate', url: '/pages/billing/my-package/index', showArrow: true },
        { label: '消费记录', type: 'navigate', url: '/pages/billing/transactions/index', showArrow: true },
        { label: '我的订单', type: 'navigate', url: '/pages/billing/orders/index', showArrow: true },
      ],
    },
    {
      title: '关于',
      items: [
        { label: '关于 ReelClone', type: 'navigate', url: '/pages/settings/about/index', showArrow: true },
        { label: '用户协议', type: 'navigate', url: '/pages/settings/user-agreement/index', showArrow: true },
        { label: '隐私协议', type: 'navigate', url: '/pages/settings/privacy/index', showArrow: true },
      ],
    },
  ];

  return (
    <View className='settings-page'>
      <ScrollView scrollY className='settings-page__scroll'>
        {groups.map((group, gIdx) => (
          <View key={gIdx} className='settings-page__group'>
            {group.title ? (
              <Text className='settings-page__group-title'>{group.title}</Text>
            ) : null}
            <View className='settings-page__group-body'>
              {group.items.map((item, iIdx) => (
                <View
                  key={iIdx}
                  className={`settings-page__item ${iIdx < group.items.length - 1 ? 'settings-page__item--border' : ''}`}
                  onClick={() => {
                    if (item.type === 'navigate' && item.url) {
                      handleNavigate(item.url);
                    } else if (item.onClick) {
                      item.onClick();
                    }
                  }}
                >
                  <Text className='settings-page__item-label'>{item.label}</Text>
                  <View className='settings-page__item-right'>
                    {item.value ? (
                      <Text className='settings-page__item-value'>{item.value}</Text>
                    ) : null}
                    {item.type === 'copy' ? (
                      <Text className='settings-page__item-action'>复制</Text>
                    ) : null}
                    {item.showArrow ? (
                      <Text className='settings-page__item-arrow'>›</Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* 底部信息 */}
        <View className='settings-page__footer'>
          <Text className='settings-page__footer-icp'>{ICP_NUMBER}</Text>
          <Text className='settings-page__footer-version'>ReelClone v{APP_VERSION}</Text>
        </View>
      </ScrollView>

      {/* 绑定手机号弹窗 */}
      <BindMobileModal
        visible={bindModalVisible}
        onClose={() => setBindModalVisible(false)}
        onSuccess={handleBindSuccess}
      />

      {/* 修改密码弹窗（默认已设置密码模式） */}
      <ChangePasswordModal
        visible={pwdModalVisible}
        hasPassword={true}
        mobile={user?.mobile || ''}
        onClose={() => setPwdModalVisible(false)}
        onSuccess={handlePwdSuccess}
      />
    </View>
  );
}
