/**
 * 编辑视频工作台
 * 对应 FR2_视频生成_05_编辑视频
 *
 * - 原视频上传：MediaUploader(type=video, maxCount=1)
 * - 参考图片（可选）：MediaUploader(type=image, maxCount=14)
 * - 提示词（可选）
 * - 积分：1500 积分/次
 */
import { useState, useCallback } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { CreditBadge, MediaUploader, PromptInput } from '@/components';
import { useCredits } from '@/hooks/useCredits';
import { createGeneration } from '@/services/api/workbench.api';
import { usePointsStore } from '@/stores/points.store';
import './index.scss';

/** 单次编辑视频消耗积分 */
const POINTS_PER_CALL = 1500;

export default function VideoEditWorkbench() {
  const [videoKeys, setVideoKeys] = useState<string[]>([]);
  const [referenceKeys, setReferenceKeys] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { balance } = useCredits();
  const consume = usePointsStore((s) => s.consume);

  const handleSubmit = useCallback(async () => {
    if (videoKeys.length === 0) {
      Taro.showToast({ title: '请上传原视频', icon: 'none' });
      return;
    }
    if (balance < POINTS_PER_CALL) {
      Taro.showToast({ title: '积分不足', icon: 'none' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await createGeneration({
        generationType: 'EDIT_VIDEO',
        prompt: prompt.trim(),
        referenceVideo: videoKeys[0],
        referenceImages: referenceKeys.length > 0 ? referenceKeys : undefined,
      });
      consume(POINTS_PER_CALL);
      Taro.showToast({ title: '生成任务已提交', icon: 'success' });
      setTimeout(() => {
        Taro.redirectTo({
          url: `/pages/workbench/work-detail/index?workId=${res.workId}`,
        });
      }, 800);
    } catch (err) {
      // 错误已由 request 层统一 toast
    } finally {
      setSubmitting(false);
    }
  }, [videoKeys, referenceKeys, prompt, balance, consume]);

  return (
    <View className='video-edit-wb page-wrap'>
      <View className='page-wrap__header'>
        <Text className='page-wrap__title'>编辑视频</Text>
        <View className='page-wrap__credits'>
          <CreditBadge amount={balance} size='sm' />
          <Text className='video-edit-wb__cost'>{POINTS_PER_CALL} 积分/次</Text>
        </View>
      </View>

      <View className='video-edit-wb__body'>
        {/* 原视频上传 */}
        <View className='page-wrap__section'>
          <Text className='page-wrap__label'>原视频 *</Text>
          <MediaUploader
            type='video'
            maxCount={1}
            value={videoKeys}
            onChange={setVideoKeys}
          />
        </View>

        {/* 参考图片（可选） */}
        <View className='page-wrap__section'>
          <Text className='page-wrap__label'>参考图片（可选，最多 14 张）</Text>
          <MediaUploader
            type='image'
            maxCount={14}
            value={referenceKeys}
            onChange={setReferenceKeys}
          />
        </View>

        {/* 提示词（可选） */}
        <View className='page-wrap__section'>
          <Text className='page-wrap__label'>提示词（可选）</Text>
          <PromptInput
            value={prompt}
            onChange={setPrompt}
            maxLength={2000}
            placeholder='描述你想要的编辑效果，如风格变换、画面修改等（可选）'
          />
        </View>
      </View>

      <View className='video-edit-wb__footer'>
        <View
          className={`page-wrap__btn ${
            submitting || videoKeys.length === 0 ? 'page-wrap__btn--disabled' : ''
          }`}
          onClick={handleSubmit}
        >
          <Text>{submitting ? '生成中...' : `开始生成（${POINTS_PER_CALL}积分）`}</Text>
        </View>
      </View>
    </View>
  );
}
