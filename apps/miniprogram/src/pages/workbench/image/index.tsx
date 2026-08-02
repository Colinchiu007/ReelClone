/**
 * 图片生成工作台
 * 对应 FR2_图片生成_01_反推提示词与图生图
 *
 * - 反推提示词区：单图上传 + 反推按钮，自动填充提示词
 * - 参考图区：最多 14 张
 * - 提示词区：PromptInput(maxLength=3000)
 * - 积分：60 积分/次
 */
import { useState, useCallback } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { CreditBadge, MediaUploader, PromptInput } from '@/components';
import { useCredits } from '@/hooks/useCredits';
import { createGeneration } from '@/services/api/workbench.api';
import { usePointsStore } from '@/stores/points.store';
import { GenerationType, getFixedPoints } from '@/utils/capabilities';
import './index.scss';

const TYPE = GenerationType.IMAGE_GENERATE;
/** 单次图片生成消耗积分 */
const POINTS_PER_CALL = getFixedPoints(TYPE) ?? 60;

export default function ImageWorkbench() {
  const [reverseKeys, setReverseKeys] = useState<string[]>([]);
  const [referenceKeys, setReferenceKeys] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reversing, setReversing] = useState(false);

  const { balance } = useCredits();
  const consume = usePointsStore((s) => s.consume);

  /** 反推提示词 */
  const handleReverse = useCallback(async () => {
    if (reverseKeys.length === 0) {
      Taro.showToast({ title: '请先上传一张图片', icon: 'none' });
      return;
    }

    setReversing(true);
    Taro.showLoading({ title: '反推中...', mask: true });
    try {
      const res = await createGeneration({
        generationType: 'IMAGE_GENERATE',
        prompt: '',
        referenceImages: reverseKeys,
        model: 'prompt-reverse',
      });
      Taro.hideLoading();
      // 反推任务已提交，将返回的描述填充到提示词区
      // 实际描述文本会通过 WebSocket 推送或后续轮询获取，这里使用占位
      setPrompt((prev) =>
        prev.trim()
          ? `${prev.trim()}\n[反推结果 workId: ${res.workId}]`
          : `[反推结果 workId: ${res.workId}]`,
      );
      Taro.showToast({ title: '反推任务已提交', icon: 'success' });
    } catch (err) {
      Taro.hideLoading();
    } finally {
      setReversing(false);
    }
  }, [reverseKeys]);

  /** 开始生成图片 */
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      Taro.showToast({ title: '请输入提示词', icon: 'none' });
      return;
    }
    if (balance < POINTS_PER_CALL) {
      Taro.showToast({ title: '积分不足', icon: 'none' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await createGeneration({
        generationType: 'IMAGE_GENERATE',
        prompt: prompt.trim(),
        referenceImages: referenceKeys.length > 0 ? referenceKeys : undefined,
      });
      consume(POINTS_PER_CALL);
      Taro.showToast({ title: '生成任务已提交', icon: 'success' });
      // 跳转到作品详情
      setTimeout(() => {
        Taro.navigateTo({
          url: `/pages/workbench/work-detail/index?workId=${res.workId}`,
        });
      }, 800);
    } catch (err) {
      // 错误已由 request 层统一 toast
    } finally {
      setSubmitting(false);
    }
  }, [prompt, referenceKeys, balance, consume]);

  return (
    <View className='image-wb page-wrap'>
      {/* 顶部：标题 + 积分余额 */}
      <View className='page-wrap__header'>
        <Text className='page-wrap__title'>图片生成</Text>
        <View className='page-wrap__credits'>
          <CreditBadge amount={balance} size='sm' />
          <Text className='image-wb__cost'>{POINTS_PER_CALL} 积分/次</Text>
        </View>
      </View>

      <View className='image-wb__body'>
        {/* 反推提示词区 */}
        <View className='page-wrap__section'>
          <Text className='page-wrap__label'>反推提示词（可选）</Text>
          <Text className='image-wb__hint'>
            上传一张参考图，自动反推生成提示词
          </Text>
          <MediaUploader
            type='image'
            maxCount={1}
            value={reverseKeys}
            onChange={setReverseKeys}
          />
          <View
            className={`image-wb__reverse-btn ${
              reversing || reverseKeys.length === 0 ? 'page-wrap__btn--disabled' : ''
            }`}
            onClick={handleReverse}
          >
            <Text>{reversing ? '反推中...' : '反推提示词'}</Text>
          </View>
        </View>

        {/* 参考图区 */}
        <View className='page-wrap__section'>
          <Text className='page-wrap__label'>参考图（可选，最多 14 张）</Text>
          <MediaUploader
            type='image'
            maxCount={14}
            value={referenceKeys}
            onChange={setReferenceKeys}
          />
        </View>

        {/* 提示词区 */}
        <View className='page-wrap__section'>
          <Text className='page-wrap__label'>提示词</Text>
          <PromptInput
            value={prompt}
            onChange={setPrompt}
            maxLength={3000}
            placeholder='描述你想要生成的图片内容、风格、构图...'
          />
        </View>
      </View>

      {/* 底部生成按钮 */}
      <View className='image-wb__footer'>
        <View
          className={`page-wrap__btn ${
            submitting || !prompt.trim() ? 'page-wrap__btn--disabled' : ''
          }`}
          onClick={handleGenerate}
        >
          <Text>
            {submitting ? '生成中...' : `开始生成（${POINTS_PER_CALL}积分）`}
          </Text>
        </View>
      </View>
    </View>
  );
}
