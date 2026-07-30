/**
 * 上传视频转模板页（template 分包）
 * 对应 FR-01 ~ FR-11 — 用户上传视频由系统转化为模板
 *
 * 流程（分步骤状态机）：
 *  1. select  — 选择视频（Taro.chooseVideo）+ 校验格式/大小/时长
 *  2. upload  — 上传到 OSS + 登记资产（createAsset）
 *  3. form    — 填写模板信息（标题/描述/平台/分类/行业/标签）
 *  4. submit  — 提交 uploadTemplate，进入 ANALYZING
 *  5. analyzing — 轮询 getUploadStatus（2s 间隔，最长 5 分钟）
 *  6. success / failed — 结果展示 + 导航
 *
 * 视频限制（FR-11）：mp4/mov，≤ 100MB，时长 3-60s
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { View, Text, Input, Textarea } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { LoadingState, ErrorState, IndustryPicker } from '@/components'
import { useUpload } from '@/hooks/useUpload'
import { createAsset } from '@/services/api/asset.api'
import { uploadTemplate, getUploadStatus } from '@/services/api/template.api'
import type { UploadResult } from '@/types'
import './index.scss'

/** 步骤枚举 */
type Step = 'select' | 'uploading' | 'form' | 'submitting' | 'analyzing' | 'success' | 'failed'

/** 平台选项 */
const PLATFORMS = ['抖音', '小红书', '视频号', '快手', 'B站']

/** 分类选项 */
const CATEGORIES = ['口播', '剧情', '测评', '教程', 'Vlog', '混剪']

/** 标签最大数量 */
const MAX_TAGS = 5

/** 视频限制常量（FR-11） */
const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB
const MIN_DURATION = 3 // 秒
const MAX_DURATION = 60 // 秒
const ALLOWED_EXTENSIONS = ['mp4', 'mov']

/** 轮询配置 */
const POLL_INTERVAL_MS = 2000
const POLL_MAX_DURATION_MS = 5 * 60 * 1000 // 5 分钟

export default function UploadTemplatePage() {
  const [step, setStep] = useState<Step>('select')
  const [videoInfo, setVideoInfo] = useState<{
    path: string
    size: number
    duration: number
  } | null>(null)
  const [assetId, setAssetId] = useState<string>('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string>('')

  // 表单状态
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [platform, setPlatform] = useState('')
  const [category, setCategory] = useState('')
  const [industries, setIndustries] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')

  // 分析结果
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [failureReason, setFailureReason] = useState<string>('')

  const { upload } = useUpload()

  // 轮询定时器引用
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollStartRef = useRef<number>(0)

  /** 清理轮询定时器 */
  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => clearPollTimer()
  }, [clearPollTimer])

  /** Step 2: 上传视频到 OSS + 登记资产 */
  const handleUpload = useCallback(
    async (filePath: string, fileSize: number) => {
      setStep('uploading')
      setUploadProgress(0)
      setUploadError('')
      try {
        const result = await upload({ path: filePath, size: fileSize }, 'video')
        setUploadProgress(100)
        // 登记资产
        const asset = await createAsset({
          assetType: 'VIDEO',
          storageKey: result.key,
          fileName: filePath.split('/').pop() || `upload-${Date.now()}`,
          fileSize,
          duration: videoInfo?.duration,
          status: 'ACTIVE',
        })
        setAssetId(asset.id)
        setStep('form')
      } catch (err) {
        setUploadError((err as Error).message || '视频上传失败')
        setStep('select')
      }
    },
    [upload, videoInfo],
  )

  /** Step 1: 选择视频 */
  const handleSelectVideo = useCallback(async () => {
    if (step !== 'select') return
    try {
      const res = await Taro.chooseVideo({
        sourceType: ['album'],
        maxDuration: MAX_DURATION,
        camera: 'back',
      })
      // 校验格式
      const ext = (res.tempFilePath || '').split('.').pop()?.toLowerCase() || ''
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        Taro.showToast({ title: `仅支持 ${ALLOWED_EXTENSIONS.join('/')} 格式`, icon: 'none' })
        return
      }
      // 校验大小
      if (res.size > MAX_FILE_SIZE) {
        Taro.showToast({ title: '视频大小不能超过 100MB', icon: 'none' })
        return
      }
      // 校验时长
      if (res.duration < MIN_DURATION || res.duration > MAX_DURATION) {
        Taro.showToast({
          title: `视频时长需在 ${MIN_DURATION}-${MAX_DURATION} 秒之间`,
          icon: 'none',
        })
        return
      }
      setVideoInfo({
        path: res.tempFilePath,
        size: res.size,
        duration: Math.round(res.duration),
      })
      // 自动进入上传步骤
      void handleUpload(res.tempFilePath, res.size)
    } catch (err) {
      // 用户取消选择，静默处理
    }
  }, [step, handleUpload])

  /** 重新选择视频 */
  const handleReselect = useCallback(() => {
    setVideoInfo(null)
    setAssetId('')
    setUploadProgress(0)
    setUploadError('')
    setStep('select')
  }, [])

  /** 添加标签 */
  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim()
    if (!trimmed) return
    if (tags.includes(trimmed)) {
      Taro.showToast({ title: '标签已存在', icon: 'none' })
      return
    }
    if (tags.length >= MAX_TAGS) {
      Taro.showToast({ title: `最多 ${MAX_TAGS} 个标签`, icon: 'none' })
      return
    }
    setTags((prev) => [...prev, trimmed])
    setTagInput('')
  }, [tagInput, tags])

  /** 删除标签 */
  const handleRemoveTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag))
  }, [])

  /** Step 3-4: 提交转模板 */
  const handleSubmit = useCallback(async () => {
    if (!assetId) return
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      Taro.showToast({ title: '请填写标题', icon: 'none' })
      return
    }
    setStep('submitting')
    try {
      const result = await uploadTemplate({
        assetId,
        title: trimmedTitle,
        description: description.trim() || undefined,
        category: category || undefined,
        industry: industries[0] || undefined,
        platform: platform || undefined,
        tags: tags.length > 0 ? tags : undefined,
      })
      setUploadResult(result)
      setStep('analyzing')
      // 开始轮询
      pollStartRef.current = Date.now()
      void pollStatus(result.workflowId)
    } catch (err) {
      // 提交失败，回到表单
      setStep('form')
    }
  }, [assetId, title, description, category, industries, platform, tags])

  /** Step 5: 轮询分析状态 */
  const pollStatus = useCallback(
    async (workflowId: string) => {
      clearPollTimer()
      // 超时检查
      if (Date.now() - pollStartRef.current > POLL_MAX_DURATION_MS) {
        setFailureReason('分析超时，请稍后在"我的上传"中查看结果')
        setStep('failed')
        return
      }
      try {
        const res = await getUploadStatus(workflowId)
        if (res.status === 'ACTIVE') {
          setStep('success')
          return
        }
        if (res.status === 'ANALYSIS_FAILED') {
          setFailureReason(res.failureReason || '视频分析失败')
          setStep('failed')
          return
        }
        // 仍在 ANALYZING，继续轮询
        pollTimerRef.current = setTimeout(() => void pollStatus(workflowId), POLL_INTERVAL_MS)
      } catch (err) {
        // 网络错误：延迟后重试（不立即失败）
        pollTimerRef.current = setTimeout(() => void pollStatus(workflowId), POLL_INTERVAL_MS)
      }
    },
    [clearPollTimer],
  )

  /** 成功后查看模板 */
  const handleViewTemplate = useCallback(() => {
    if (uploadResult?.templateId) {
      Taro.redirectTo({
        url: `/pages/template/detail/index?templateId=${uploadResult.templateId}`,
      })
    }
  }, [uploadResult])

  /** 失败后重试（回到选视频） */
  const handleRetry = useCallback(() => {
    clearPollTimer()
    setVideoInfo(null)
    setAssetId('')
    setUploadResult(null)
    setFailureReason('')
    setTitle('')
    setDescription('')
    setPlatform('')
    setCategory('')
    setIndustries([])
    setTags([])
    setStep('select')
  }, [clearPollTimer])

  // -------------------- 渲染各步骤 --------------------

  /** 选择视频步骤 */
  const renderSelect = () => (
    <View className="upload-tpl__step">
      <View className="upload-tpl__select-area" onClick={handleSelectVideo}>
        <Text className="upload-tpl__select-icon">+</Text>
        <Text className="upload-tpl__select-text">选择视频</Text>
        <Text className="upload-tpl__select-hint">
          支持 mp4/mov 格式，大小 ≤ 100MB，时长 3-60 秒
        </Text>
      </View>
      {uploadError ? <Text className="upload-tpl__error-text">{uploadError}</Text> : null}
    </View>
  )

  /** 上传中步骤 */
  const renderUploading = () => (
    <View className="upload-tpl__step">
      <LoadingState title="视频上传中..." />
      <View className="upload-tpl__progress">
        <View className="upload-tpl__progress-bar" style={{ width: `${uploadProgress}%` }} />
      </View>
      <Text className="upload-tpl__progress-text">{uploadProgress}%</Text>
    </View>
  )

  /** 填写表单步骤 */
  const renderForm = () => (
    <View className="upload-tpl__step">
      {/* 视频预览信息 */}
      <View className="upload-tpl__video-info">
        <Text className="upload-tpl__video-info-text">视频 · {videoInfo?.duration}秒 · 已上传</Text>
        <Text className="upload-tpl__video-info-change" onClick={handleReselect}>
          重新选择
        </Text>
      </View>

      {/* 标题 */}
      <View className="upload-tpl__section">
        <Text className="upload-tpl__label">
          标题<Text className="upload-tpl__required">*</Text>
        </Text>
        <View className="upload-tpl__input-wrap">
          <Input
            className="upload-tpl__input"
            value={title}
            placeholder="为模板起一个吸引人的标题"
            placeholderClass="upload-tpl__placeholder"
            maxlength={50}
            onInput={(e) => setTitle(e.detail.value)}
          />
        </View>
      </View>

      {/* 描述 */}
      <View className="upload-tpl__section">
        <Text className="upload-tpl__label">描述</Text>
        <View className="upload-tpl__textarea-wrap">
          <Textarea
            className="upload-tpl__textarea"
            value={description}
            placeholder="补充模板的使用场景、亮点或注意事项..."
            placeholderClass="upload-tpl__placeholder"
            maxlength={500}
            autoHeight
            onInput={(e) => setDescription(e.detail.value)}
          />
        </View>
      </View>

      {/* 平台 */}
      <View className="upload-tpl__section">
        <Text className="upload-tpl__label">适用平台</Text>
        <View className="upload-tpl__row">
          {PLATFORMS.map((p) => (
            <View
              key={p}
              className={`upload-tpl__chip ${platform === p ? 'upload-tpl__chip--on' : ''}`}
              onClick={() => setPlatform(platform === p ? '' : p)}
            >
              <Text>{p}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 分类 */}
      <View className="upload-tpl__section">
        <Text className="upload-tpl__label">分类</Text>
        <View className="upload-tpl__row">
          {CATEGORIES.map((c) => (
            <View
              key={c}
              className={`upload-tpl__chip ${category === c ? 'upload-tpl__chip--on' : ''}`}
              onClick={() => setCategory(category === c ? '' : c)}
            >
              <Text>{c}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 行业 */}
      <View className="upload-tpl__section">
        <Text className="upload-tpl__label">行业</Text>
        <IndustryPicker value={industries} onChange={setIndustries} max={1} min={0} />
      </View>

      {/* 标签 */}
      <View className="upload-tpl__section">
        <Text className="upload-tpl__label">
          标签（{tags.length}/{MAX_TAGS}）
        </Text>
        <View className="upload-tpl__tag-input">
          <Input
            className="upload-tpl__input upload-tpl__tag-input-field"
            value={tagInput}
            placeholder="输入标签后点击添加"
            placeholderClass="upload-tpl__placeholder"
            maxlength={20}
            onInput={(e) => setTagInput(e.detail.value)}
          />
          <View
            className={`upload-tpl__tag-add ${
              !tagInput.trim() ? 'upload-tpl__tag-add--disabled' : ''
            }`}
            onClick={handleAddTag}
          >
            <Text>添加</Text>
          </View>
        </View>
        {tags.length > 0 ? (
          <View className="upload-tpl__tag-list">
            {tags.map((tag) => (
              <View key={tag} className="upload-tpl__tag-item">
                <Text className="upload-tpl__tag-text">{tag}</Text>
                <Text className="upload-tpl__tag-remove" onClick={() => handleRemoveTag(tag)}>
                  ×
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {/* 提交按钮 */}
      <View
        className={`upload-tpl__submit ${!title.trim() ? 'upload-tpl__submit--disabled' : ''}`}
        onClick={handleSubmit}
      >
        <Text>提交转模板</Text>
      </View>
    </View>
  )

  /** 提交中步骤 */
  const renderSubmitting = () => (
    <View className="upload-tpl__step">
      <LoadingState title="提交中..." />
    </View>
  )

  /** 分析中步骤 */
  const renderAnalyzing = () => (
    <View className="upload-tpl__step">
      <View className="upload-tpl__status-card">
        <Text className="upload-tpl__status-icon">🎬</Text>
        <Text className="upload-tpl__status-title">视频分析中</Text>
        <Text className="upload-tpl__status-desc">
          系统正在分析视频元数据、镜头切分、运镜方式与风格标签，生成可复用的创作模板...
        </Text>
        <Text className="upload-tpl__status-hint">预计需要 1-3 分钟，请耐心等待</Text>
      </View>
    </View>
  )

  /** 成功步骤 */
  const renderSuccess = () => (
    <View className="upload-tpl__step">
      <View className="upload-tpl__status-card">
        <Text className="upload-tpl__status-icon upload-tpl__status-icon--success">✓</Text>
        <Text className="upload-tpl__status-title">模板生成成功</Text>
        <Text className="upload-tpl__status-desc">
          您的模板已发布到模板广场，其他用户可以基于此模板创作新视频。
        </Text>
        <View className="upload-tpl__status-actions">
          <View
            className="upload-tpl__status-btn upload-tpl__status-btn--primary"
            onClick={handleViewTemplate}
          >
            <Text>查看模板</Text>
          </View>
          <View className="upload-tpl__status-btn" onClick={() => Taro.navigateBack()}>
            <Text>返回</Text>
          </View>
        </View>
      </View>
    </View>
  )

  /** 失败步骤 */
  const renderFailed = () => (
    <View className="upload-tpl__step">
      <ErrorState
        title="模板生成失败"
        description={failureReason || '视频分析过程中出现错误'}
        onRetry={handleRetry}
      />
    </View>
  )

  // -------------------- 根据步骤渲染 --------------------
  const renderStep = () => {
    switch (step) {
      case 'select':
        return renderSelect()
      case 'uploading':
        return renderUploading()
      case 'form':
        return renderForm()
      case 'submitting':
        return renderSubmitting()
      case 'analyzing':
        return renderAnalyzing()
      case 'success':
        return renderSuccess()
      case 'failed':
        return renderFailed()
      default:
        return renderSelect()
    }
  }

  const stepTitle =
    step === 'select' || step === 'uploading'
      ? '上传视频'
      : step === 'form'
        ? '填写模板信息'
        : step === 'analyzing' || step === 'submitting'
          ? '生成模板'
          : '完成'

  return (
    <View className="upload-tpl">
      {/* 顶部导航 */}
      <View className="upload-tpl__nav">
        <View className="upload-tpl__back" onClick={() => Taro.navigateBack()}>
          <Text>‹</Text>
        </View>
        <Text className="upload-tpl__nav-title">{stepTitle}</Text>
        <View className="upload-tpl__nav-placeholder" />
      </View>

      <View className="upload-tpl__body">{renderStep()}</View>
    </View>
  )
}
