import { View, Text, Textarea, ScrollView } from '@tarojs/components';
import './index.scss';

/**
 * PromptInput 提示词输入组件
 * 多行文本输入 + 字数统计 + 可选行业标签横向滚动
 */

export interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  showCount?: boolean;
  /** 快捷行业标签 */
  industryTags?: string[];
  /** 点击行业标签回调；不传时默认追加到输入框 */
  onIndustryTagClick?: (tag: string) => void;
}

export default function PromptInput({
  value,
  onChange,
  maxLength = 2000,
  placeholder = '请输入提示词，描述你想要的画面、风格、节奏...',
  showCount = true,
  industryTags = [],
  onIndustryTagClick,
}: PromptInputProps) {
  const handleInput = (e: { detail: { value: string } }) => {
    let next = e.detail.value;
    if (next.length > maxLength) {
      next = next.slice(0, maxLength);
    }
    onChange(next);
  };

  const handleTagClick = (tag: string) => {
    if (onIndustryTagClick) {
      onIndustryTagClick(tag);
      return;
    }
    // 默认行为：将标签追加到输入框末尾（以逗号分隔）
    const trimmed = value.trim();
    const next = trimmed ? `${trimmed}，${tag}` : tag;
    const clipped = next.length > maxLength ? next.slice(0, maxLength) : next;
    onChange(clipped);
  };

  const count = value.length;

  return (
    <View className='prompt-input'>
      <View className='prompt-input__box'>
        <Textarea
          className='prompt-input__textarea'
          value={value}
          placeholder={placeholder}
          placeholderClass='prompt-input__placeholder'
          maxlength={maxLength}
          autoHeight
          onInput={handleInput}
        />
        {showCount ? (
          <View className='prompt-input__count'>
            <Text className='prompt-input__count-current'>{count}</Text>
            <Text className='prompt-input__count-sep'>/</Text>
            <Text className='prompt-input__count-max'>{maxLength}</Text>
          </View>
        ) : null}
      </View>
      {industryTags && industryTags.length > 0 ? (
        <ScrollView className='prompt-input__tags' scrollX>
          {industryTags.map((tag) => (
            <View
              key={tag}
              className='prompt-input__tag'
              onClick={() => handleTagClick(tag)}
            >
              <Text>{tag}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
