/**
 * 延长视频工作台
 * 对应 FR2_视频生成_06_延长视频
 *
 * - 视频上传：MediaUploader(type=video, maxCount=3, maxDuration=15)
 *   注意：总时长限制 15s
 * - 延长时长选择：5秒 / 10秒
 * - 积分：1200 积分/次
 */
import { useState, useCallback } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useLoad } from '@tarojs/taro';
import { CreditBadge, MediaUploader } from '@/components';
import { useCredits } from '@/hooks/useCredits';
import { createGeneration } from '@/services/api/workbench.api';
import { usePointsStore } from '@/stores/points.store';
import { GenerationType, getFixedPoints } from '@/utils/capabilities';
import './index.scss';

const TYPE = GenerationType.EXTEND_VIDEO;
/** 单次延长视频消耗积分 */
const POINTS_PER_CALL = getFixedPoints(TYPE) ?? 1200;

/** 延长时长选项 */
const EXTEND_DURATIONS = [5, 10];

export default function VideoExtendWorkbench() {
  useLoad(() => Taro.setNavigationBarTitle({ title: '延长视频' }));
  const [videoKeys, setVideoKeys] = useState<string[]>([]);
  const [duration, setDuration] = useState(5);
  const [submitting, setSubmitting] = useState(false);

  const { balance } = useCredits();
  const consume = usePointsStore((s) => s.consume);

  const handleSubmit = useCallback(async () => {
    if (videoKeys.length === 0) {
      Taro.showToast({ title: '请上传视频', icon: 'none' });
      return;
    }
    if (balance < POINTS_PER_CALL) {
      Taro.showToast({ title: '积分不足', icon: 'none' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await createGeneration({
        generationType: 'EXTEND_VIDEO',
        prompt: '',
        referenceVideo: videoKeys[0],
        duration: duration as 5 | 10,
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
  }, [videoKeys, duration, balance, consume]);

  return (
    <View className='video-extend-wb page-wrap'>
      <View className='page-wrap__header'>
        <Text className='page-wrap__title'>延长视频</Text>
        <View className='page-wrap__credits'>
          <CreditBadge amount={balance} size='sm' />
          <Text className='video-extend-wb__cost'>{POINTS_PER_CALL} 积分/次</Text>
        </View>
      </View>

      <View className='video-extend-wb__body'>
        {/* 视频上传 */}
        <View className='page-wrap__section'>
          <Text className='page-wrap__label'>原视频 *（最多 3 段，总时长 15s 内）</Text>
          <MediaUploader
            type='video'
            maxCount={3}
            maxDuration={15}
            value={videoKeys}
            onChange={setVideoKeys}
          />
        </View>

        {/* 延长时长 */}
        <View className='page-wrap__section'>
          <Text className='page-wrap__label'>延长时长</Text>
          <View className='video-extend-wb__duration'>
            {EXTEND_DURATIONS.map((d) => (
              <View
                key={d}
                className={`video-extend-wb__duration-item ${
                  duration === d ? 'video-extend-wb__duration-item--on' : ''
                }`}
                onClick={() => setDuration(d)}
              >
                <Text>{d}秒</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 预计消耗积分 */}
        <View className='video-extend-wb__estimate'>
          <Text className='video-extend-wb__estimate-label'>预计消耗</Text>
          <Text className='video-extend-wb__estimate-value'>
            {POINTS_PER_CALL} 积分
          </Text>
        </View>
      </View>

      <View className='video-extend-wb__footer'>
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
