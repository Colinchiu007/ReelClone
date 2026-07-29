import { View, Text } from '@tarojs/components';
import './index.scss';

/**
 * IndustryPicker 行业选择器
 * 网格布局（3 列），多选，超过 max 阻止选中
 */

export interface IndustryPickerProps {
  value: string[];
  onChange: (industries: string[]) => void;
  /** 最多选择数量，默认 3 */
  max?: number;
  /** 最少选择数量，默认 1（仅约束展示提示，不强制） */
  min?: number;
}

/** 内置行业列表（共 20 项） */
export const DEFAULT_INDUSTRIES: string[] = [
  '好物种草',
  '本地生活',
  '教育培训',
  'IP 口播',
  '老乡情怀',
  '人设',
  '卖货',
  '破播',
  '种草',
  '数码',
  '美妆',
  '服饰',
  '美食',
  '旅游',
  '健身',
  '母婴',
  '宠物',
  '家居',
  '汽车',
  '金融',
];

export default function IndustryPicker({
  value = [],
  onChange,
  max = 3,
  min = 1,
}: IndustryPickerProps) {
  const selected = new Set(value);

  const handleToggle = (industry: string) => {
    if (selected.has(industry)) {
      // 已选中：判断是否还能取消（保留 min）
      if (value.length <= min) {
        return;
      }
      onChange(value.filter((i) => i !== industry));
    } else {
      // 未选中：判断是否还能选（不超过 max）
      if (value.length >= max) {
        return;
      }
      onChange([...value, industry]);
    }
  };

  return (
    <View className='industry-picker'>
      <View className='industry-picker__header'>
        <Text className='industry-picker__hint'>
          选择行业偏好（{value.length}/{max}）
        </Text>
      </View>
      <View className='industry-picker__grid'>
        {DEFAULT_INDUSTRIES.map((industry) => {
          const isOn = selected.has(industry);
          return (
            <View
              key={industry}
              className={`industry-picker__item ${
                isOn ? 'industry-picker__item--on' : ''
              }`}
              onClick={() => handleToggle(industry)}
            >
              <Text>{industry}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
