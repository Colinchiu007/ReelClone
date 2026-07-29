/**
 * 行业偏好选择弹窗（template 分包内组件）
 * 对应 FR4_灵感广场_01_行业偏好绑定弹窗 / 02_选择行业标签
 *
 * 由 gallery/index.tsx 引入：
 *  - 首次进入：getIndustryPreferences() 为空时自动弹出
 *  - 设置入口：用户主动点击"修改行业"再次唤起
 *
 * 保存后调用 setIndustryPreferences，并通知父组件刷新列表。
 */
import { useEffect, useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { IndustryPicker } from '@/components';
import { setIndustryPreferences } from '@/services/api/template.api';
import './index.scss';

export interface IndustryModalProps {
  visible: boolean;
  /** 初始已选行业（来自用户偏好） */
  initialIndustries?: string[];
  /** 是否允许通过遮罩/返回关闭（首次进入时建议 false） */
  closable?: boolean;
  onClose: () => void;
  /** 保存成功回调，参数为已保存的行业列表 */
  onSaved?: (industries: string[]) => void;
}

export default function IndustryModal({
  visible,
  initialIndustries = [],
  closable = true,
  onClose,
  onSaved,
}: IndustryModalProps) {
  const [industries, setIndustries] = useState<string[]>(initialIndustries);
  const [saving, setSaving] = useState(false);

  // 弹窗每次打开时重置为最新初始值
  useEffect(() => {
    if (visible) {
      setIndustries(initialIndustries);
      setSaving(false);
    }
  }, [visible, initialIndustries]);

  if (!visible) return null;

  const canSave = industries.length >= 1 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await setIndustryPreferences(industries);
      Taro.showToast({ title: '已保存', icon: 'success', duration: 1200 });
      onSaved?.(industries);
      onClose();
    } catch {
      // request 层已统一 toast
    } finally {
      setSaving(false);
    }
  };

  const handleMaskTap = () => {
    if (closable && !saving) onClose();
  };

  return (
    <View className='industry-modal'>
      <View className='industry-modal__mask' onClick={handleMaskTap} />
      <View className='industry-modal__panel' catchMove>
        <View className='industry-modal__header'>
          <Text className='industry-modal__title'>选择你感兴趣的行业（1-3个）</Text>
          {closable ? (
            <Text className='industry-modal__close' onClick={onClose}>✕</Text>
          ) : null}
        </View>
        <View className='industry-modal__body'>
          <IndustryPicker
            value={industries}
            onChange={setIndustries}
            max={3}
            min={1}
          />
        </View>
        <View className='industry-modal__footer'>
          <View
            className={`industry-modal__btn ${
              canSave ? '' : 'industry-modal__btn--disabled'
            }`}
            onClick={handleSave}
          >
            <Text>{saving ? '保存中...' : '保存'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
