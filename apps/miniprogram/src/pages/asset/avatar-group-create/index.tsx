import { useState, useCallback } from 'react';
import { View, Text, Input, Textarea } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { MediaUploader } from '@/components';
import { createAvatarGroup, createAsset } from '@/services/api/asset.api';
import './index.scss';

/**
 * 新建真人形象组页
 *
 * 对应 FR7_03 - 新建真人形象组
 *
 * 表单：
 *  - 名称（必填，1-64 字符）
 *  - 描述（可选，最长 200 字符）
 *  - 上传素材区：MediaUploader(type=image, maxCount=20)
 *    上传的素材自动归属该形象组
 *
 * 提交流程：
 *  1. createAvatarGroup({ name, description }) 创建形象组
 *  2. 批量 createAsset({ avatarGroupId, storageKey, ... }) 登记组内资产
 *  3. 成功后 navigateBack 返回形象组列表
 */

const NAME_MAX = 64;
const DESC_MAX = 200;
const MAX_IMAGES = 20;

export default function AvatarGroupCreate() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [storageKeys, setStorageKeys] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /** 表单验证：名称非空且不超过 64 字符 */
  const validate = useCallback((): string | null => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return '请输入形象组名称';
    }
    if (trimmedName.length > NAME_MAX) {
      return `名称不能超过 ${NAME_MAX} 个字符`;
    }
    if (description.length > DESC_MAX) {
      return `描述不能超过 ${DESC_MAX} 个字符`;
    }
    return null;
  }, [name, description]);

  const handleSubmit = useCallback(async () => {
    if (uploading) {
      Taro.showToast({ title: '素材上传中，请稍候', icon: 'none' });
      return;
    }

    const error = validate();
    if (error) {
      Taro.showToast({ title: error, icon: 'none' });
      return;
    }

    setSubmitting(true);
    try {
      // 1. 创建形象组
      const group = await createAvatarGroup({
        name: name.trim(),
        description: description.trim() || undefined,
      });

      // 2. 批量登记组内资产（每个 storageKey 创建一条 IMAGE 资产记录）
      if (storageKeys.length > 0) {
        let successCount = 0;
        let failCount = 0;
        for (const key of storageKeys) {
          try {
            const fileName = key.split('/').pop() || key;
            await createAsset({
              storageKey: key,
              fileName,
              assetType: 'IMAGE',
              fileSize: 0,
              avatarGroupId: group.id,
            });
            successCount++;
          } catch {
            failCount++;
          }
        }
        if (failCount > 0) {
          Taro.showToast({
            title: `创建成功，${failCount} 个素材登记失败`,
            icon: 'none',
            duration: 2000,
          });
        } else {
          Taro.showToast({
            title: `创建成功（${successCount} 张素材）`,
            icon: 'success',
          });
        }
      } else {
        Taro.showToast({ title: '创建成功', icon: 'success' });
      }

      // 3. 返回形象组列表
      setTimeout(() => {
        Taro.navigateBack();
      }, 1000);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[AvatarGroupCreate] submit failed:', err);
    } finally {
      setSubmitting(false);
    }
  }, [uploading, validate, name, description, storageKeys]);

  const handleBack = useCallback(() => {
    if (uploading || submitting) {
      Taro.showToast({ title: '正在处理中，请稍候', icon: 'none' });
      return;
    }
    Taro.navigateBack();
  }, [uploading, submitting]);

  const canSubmit = name.trim().length > 0 && !uploading && !submitting;

  return (
    <View className='create-page'>
      {/* 顶部导航 */}
      <View className='create-page__header'>
        <View className='create-page__back' onClick={handleBack}>
          <Text>←</Text>
        </View>
        <Text className='create-page__title'>新建真人形象组</Text>
        <View className='create-page__placeholder' />
      </View>

      {/* 表单 */}
      <View className='create-page__form'>
        {/* 名称 */}
        <View className='create-page__field'>
          <View className='create-page__field-label'>
            <Text className='create-page__required'>*</Text>
            <Text>名称</Text>
            <Text className='create-page__count'>
              {name.length}/{NAME_MAX}
            </Text>
          </View>
          <Input
            className='create-page__input'
            type='text'
            value={name}
            placeholder='请输入形象组名称'
            maxlength={NAME_MAX}
            onInput={(e) => setName(e.detail.value)}
          />
        </View>

        {/* 描述 */}
        <View className='create-page__field'>
          <View className='create-page__field-label'>
            <Text>描述（可选）</Text>
            <Text className='create-page__count'>
              {description.length}/{DESC_MAX}
            </Text>
          </View>
          <Textarea
            className='create-page__textarea'
            value={description}
            placeholder='请输入形象组描述...'
            maxlength={DESC_MAX}
            onInput={(e) => setDescription(e.detail.value)}
          />
        </View>

        {/* 上传素材 */}
        <View className='create-page__field'>
          <View className='create-page__field-label'>
            <Text>上传素材（可选，最多 {MAX_IMAGES} 张）</Text>
          </View>
          <MediaUploader
            type='image'
            maxCount={MAX_IMAGES}
            value={storageKeys}
            onChange={setStorageKeys}
            onUploadStart={() => setUploading(true)}
            onUploadEnd={() => setUploading(false)}
          />
          <Text className='create-page__hint'>
            上传的素材将自动归属该形象组，图片大小限制 10MB
          </Text>
        </View>
      </View>

      {/* 提交按钮 */}
      <View className='create-page__footer'>
        <View
          className={`create-page__submit ${
            !canSubmit ? 'create-page__submit--disabled' : ''
          }`}
          onClick={handleSubmit}
        >
          <Text>{submitting ? '创建中...' : uploading ? '上传中...' : '创建形象组'}</Text>
        </View>
      </View>
    </View>
  );
}
