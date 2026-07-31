import { useEffect, useState, useCallback } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { uploadFile } from '@/services/upload'
import './index.scss'

/**
 * MediaUploader 媒体上传组件
 * 支持图片/视频/音频上传到 OSS
 * 流程：调用 Taro.chooseXxx → 复用 @/services/upload 获取 STS Token 并直传 OSS → 回调 onChange
 */

export interface MediaUploaderProps {
  type: 'image' | 'video' | 'audio'
  maxCount: number
  /** 视频时长限制（秒），仅 type=video 生效 */
  maxDuration?: number
  /** 已上传的 asset key 数组 */
  value?: string[]
  onChange?: (keys: string[]) => void
  onUploadStart?: () => void
  onUploadEnd?: () => void
}

interface UploadItem {
  key: string
  thumbUrl?: string
}

export default function MediaUploader({
  type,
  maxCount,
  maxDuration = 60,
  value = [],
  onChange,
  onUploadStart,
  onUploadEnd,
}: MediaUploaderProps) {
  const [items, setItems] = useState<UploadItem[]>(value.map((k) => ({ key: k })))
  const [uploading, setUploading] = useState(false)

  // 外部 value 变化时同步内部 state（仅在长度或 key 不一致时更新）
  useEffect(() => {
    const current = items.map((i) => i.key)
    const same = current.length === value.length && current.every((k, i) => k === value[i])
    if (!same) {
      setItems(value.map((k) => ({ key: k })))
    }
  }, [value])

  const notifyChange = useCallback(
    (next: UploadItem[]) => {
      onChange?.(next.map((t) => t.key))
    },
    [onChange],
  )

  const handleChoose = useCallback(async () => {
    try {
      let filePath = ''
      let fileSize = 0
      let localThumb: string | undefined

      if (type === 'image') {
        const res = await Taro.chooseImage({
          count: 1,
          sourceType: ['album', 'camera'],
        })
        filePath = res.tempFilePaths[0]
        // chooseImage 返回的 tempFiles 含 size 信息
        const tempFile = res.tempFiles?.[0]
        fileSize = tempFile?.size ?? 0
        localThumb = filePath
      } else if (type === 'video') {
        const res = await Taro.chooseVideo({
          sourceType: ['album', 'camera'],
          maxDuration,
          compressed: true,
        })
        filePath = res.tempFilePath
        fileSize = res.size
        // Taro 类型缺失 thumbTempFilePath（WeChat 实际返回该字段），做安全访问
        localThumb =
          (
            res as Taro.chooseVideo.SuccessCallbackResult & {
              thumbTempFilePath?: string
            }
          ).thumbTempFilePath || filePath
      } else {
        const res = await Taro.chooseMessageFile({
          count: 1,
          type: 'file',
          extension: ['mp3', 'wav', 'm4a', 'aac'],
        })
        filePath = res.tempFiles[0].path
        fileSize = res.tempFiles[0].size
      }

      setUploading(true)
      onUploadStart?.()
      try {
        // 复用项目统一的 uploadFile 服务：内部完成 STS Token 获取 + OSS 直传
        const result = await uploadFile({ path: filePath, size: fileSize }, type)
        const next: UploadItem[] = [
          ...items,
          { key: result.key, thumbUrl: localThumb || result.url },
        ]
        setItems(next)
        notifyChange(next)
      } finally {
        setUploading(false)
        onUploadEnd?.()
      }
    } catch (err) {
      // chooseXxx 抛错（用户取消等）：onUploadStart 未调用，无需配对 onUploadEnd
      // eslint-disable-next-line no-console
      console.warn('[MediaUploader] upload failed:', err)
    }
  }, [type, maxDuration, items, onUploadStart, onUploadEnd, notifyChange])

  const handleDelete = useCallback(
    (idx: number, e: { stopPropagation?: () => void }) => {
      e?.stopPropagation?.()
      const next = items.filter((_, i) => i !== idx)
      setItems(next)
      notifyChange(next)
    },
    [items, notifyChange],
  )

  const reached = items.length >= maxCount
  const typeLabel = type === 'image' ? '图片' : type === 'video' ? '视频' : '音频'

  return (
    <View className="media-uploader">
      {items.map((item, idx) => (
        <View className="media-uploader__item" key={item.key + idx}>
          {item.thumbUrl ? (
            <Image className="media-uploader__thumb" src={item.thumbUrl} mode="aspectFill" />
          ) : (
            <View className="media-uploader__thumb media-uploader__thumb--placeholder">
              <Text className="media-uploader__type-tag">{typeLabel}</Text>
            </View>
          )}
          <View className="media-uploader__delete" onClick={(e) => handleDelete(idx, e)}>
            <Text>×</Text>
          </View>
        </View>
      ))}
      {!reached ? (
        <View className="media-uploader__add" onClick={handleChoose}>
          {uploading ? (
            <View className="media-uploader__spinner" />
          ) : (
            <>
              <Text className="media-uploader__plus">+</Text>
              <Text className="media-uploader__label">添加{typeLabel}</Text>
            </>
          )}
        </View>
      ) : null}
    </View>
  )
}
