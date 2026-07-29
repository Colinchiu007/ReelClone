import { useState, useCallback } from 'react';
import { View, Text, Input, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { MediaUploader, IndustryPicker } from '@/components';
import { createAsset } from '@/services/api/asset.api';
import type { Asset } from '@/types';
import './index.scss';

/**
 * UploadModal 上传素材弹窗组件
 *
 * 作为独立组件（非页面）被 pages/asset/index.tsx 引用。
 * 半透明遮罩 + 底部弹出卡片，支持图片/视频/音频上传。
 *
 * 上传流程（由 MediaUploader 内部封装）：
 *   1. MediaUploader 调用 Taro.chooseXxx 选择文件
 *   2. 内部调用 services/upload.uploadFile → getUploadToken(STS) → 直传 OSS
 *   3. onChange 回调返回已上传的 storageKey 数组
 *
 * 登记流程（本组件负责）：
 *   对每个 storageKey 调用 asset.api.createAsset 登记资产记录
 */

type FileType = 'image' | 'video' | 'audio';

interface UploadModalProps {
  visible: boolean;
  onClose: () => void;
  onUploaded?: () => void;
  /** 资产归属的形象组 ID（可选，用于形象组内上传） */
  avatarGroupId?: string;
}

interface TypeOption {
  value: FileType;
  label: string;
  assetType: Asset['assetType'];
  sizeLimit: number; // MB
}

const FILE_TYPE_OPTIONS: TypeOption[] = [
  { value: 'image', label: '图片', assetType: 'IMAGE', sizeLimit: 10 },
  { value: 'video', label: '视频', assetType: 'VIDEO', sizeLimit: 100 },
  { value: 'audio', label: '音频', assetType: 'AUDIO', sizeLimit: 50 },
];

const MAX_FILE_COUNT = 9;
const MAX_TAGS = 10;

export default function UploadModal({
  visible,
  onClose,
  onUploaded,
  avatarGroupId,
}: UploadModalProps) {
  const [fileType, setFileType] = useState<FileType>('image');
  const [storageKeys, setStorageKeys] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const resetState = useCallback(() => {
    setFileType('image');
    setStorageKeys([]);
    setIndustries([]);
    setTags([]);
    setTagInput('');
    setUploading(false);
    setSubmitting(false);
    setProgress(0);
  }, []);

  const handleClose = useCallback(() => {
    if (uploading || submitting) {
      Taro.showToast({ title: '正在处理中，请稍候', icon: 'none' });
      return;
    }
    resetState();
    onClose();
  }, [uploading, submitting, resetState, onClose]);

  const handleMaskClick = useCallback(() => {
    handleClose();
  }, [handleClose]);

  const handleCardClick = useCallback(
    (e: { stopPropagation?: () => void }) => {
      e?.stopPropagation?.();
    },
    [],
  );

  const handleFileTypeChange = useCallback(
    (next: FileType) => {
      if (uploading || submitting) return;
      // 切换类型时清空已选文件（不同类型文件不混用）
      setFileType(next);
      setStorageKeys([]);
    },
    [uploading, submitting],
  );

  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    if (tags.includes(trimmed)) {
      setTagInput('');
      return;
    }
    if (tags.length >= MAX_TAGS) {
      Taro.showToast({ title: `最多添加 ${MAX_TAGS} 个标签`, icon: 'none' });
      return;
    }
    setTags((prev) => [...prev, trimmed]);
    setTagInput('');
  }, [tagInput, tags]);

  const handleRemoveTag = useCallback((idx: number) => {
    setTags((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (uploading) {
      Taro.showToast({ title: '文件上传中，请稍候', icon: 'none' });
      return;
    }
    if (storageKeys.length === 0) {
      Taro.showToast({ title: '请先选择文件', icon: 'none' });
      return;
    }
    setSubmitting(true);
    setProgress(0);
    try {
      const option = FILE_TYPE_OPTIONS.find((o) => o.value === fileType);
      const assetType = option?.assetType ?? 'IMAGE';
      const industry = industries[0];
      let completed = 0;
      // 顺序登记资产记录，避免并发触发后端限流
      for (const key of storageKeys) {
        const fileName = key.split('/').pop() || key;
        await createAsset({
          storageKey: key,
          fileName,
          assetType,
          fileSize: 0,
          tags,
          industry,
          avatarGroupId,
        });
        completed++;
        setProgress(Math.round((completed / storageKeys.length) * 100));
      }
      Taro.showToast({ title: '上传成功', icon: 'success' });
      onUploaded?.();
      resetState();
      onClose();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[UploadModal] createAsset failed:', err);
    } finally {
      setSubmitting(false);
    }
  }, [
    uploading,
    storageKeys,
    fileType,
    industries,
    tags,
    avatarGroupId,
    onUploaded,
    resetState,
    onClose,
  ]);

  if (!visible) return null;

  return (
    <View className='upload-modal' onClick={handleMaskClick}>
      <View className='upload-modal__card' onClick={handleCardClick}>
        <View className='upload-modal__header'>
          <Text className='upload-modal__title'>上传素材</Text>
          <Text className='upload-modal__close' onClick={handleClose}>×</Text>
        </View>

        <ScrollView className='upload-modal__body' scrollY>
          {/* 文件类型选择 */}
          <View className='upload-modal__section'>
            <Text className='upload-modal__label'>文件类型</Text>
            <View className='upload-modal__type-row'>
              {FILE_TYPE_OPTIONS.map((opt) => (
                <View
                  key={opt.value}
                  className={`upload-modal__type-chip ${
                    fileType === opt.value ? 'upload-modal__type-chip--on' : ''
                  }`}
                  onClick={() => handleFileTypeChange(opt.value)}
                >
                  <Text>{opt.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* 文件选择 + 上传（MediaUploader 内部完成 STS + OSS 直传） */}
          <View className='upload-modal__section'>
            <Text className='upload-modal__label'>
              选择文件（最多 {MAX_FILE_COUNT} 个）
            </Text>
            <MediaUploader
              key={fileType}
              type={fileType}
              maxCount={MAX_FILE_COUNT}
              value={storageKeys}
              onChange={setStorageKeys}
              onUploadStart={() => setUploading(true)}
              onUploadEnd={() => setUploading(false)}
            />
            <Text className='upload-modal__hint'>
              大小限制：图片 10MB / 视频 100MB / 音频 50MB
            </Text>
          </View>

          {/* 行业分类 */}
          <View className='upload-modal__section'>
            <Text className='upload-modal__label'>行业分类（可选）</Text>
            <IndustryPicker
              value={industries}
              onChange={setIndustries}
              max={1}
              min={0}
            />
          </View>

          {/* 标签输入 */}
          <View className='upload-modal__section'>
            <Text className='upload-modal__label'>
              标签（可选，最多 {MAX_TAGS} 个）
            </Text>
            <View className='upload-modal__tag-input'>
              <Input
                className='upload-modal__input'
                type='text'
                value={tagInput}
                placeholder='输入标签后回车添加'
                onInput={(e) => setTagInput(e.detail.value)}
                onConfirm={() => handleAddTag()}
              />
              <Text className='upload-modal__tag-add' onClick={handleAddTag}>
                添加
              </Text>
            </View>
            {tags.length > 0 ? (
              <View className='upload-modal__tag-list'>
                {tags.map((tag, idx) => (
                  <View key={tag + idx} className='upload-modal__tag'>
                    <Text className='upload-modal__tag-text'>{tag}</Text>
                    <Text
                      className='upload-modal__tag-del'
                      onClick={() => handleRemoveTag(idx)}
                    >
                      ×
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </ScrollView>

        <View className='upload-modal__footer'>
          {(uploading || submitting) && (
            <View className='upload-modal__progress'>
              <View
                className='upload-modal__progress-bar'
                style={{ width: `${submitting ? progress : 30}%` }}
              />
              <Text className='upload-modal__progress-text'>
                {uploading ? '文件上传中...' : `登记中 ${progress}%`}
              </Text>
            </View>
          )}
          <View
            className={`upload-modal__submit ${
              uploading || submitting ? 'upload-modal__submit--disabled' : ''
            }`}
            onClick={handleSubmit}
          >
            <Text>
              {submitting ? '提交中...' : uploading ? '上传中...' : '确认上传'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
