/**
 * 发布为模板
 * 对应 FR9 - 将已完成的作品发布到模板广场
 *
 * - 接收参数：workId
 * - 拉取作品信息（getWork），校验状态为 COMPLETED
 * - 表单：标题（必填）、描述、平台、分类、行业、标签
 * - 提交：调用 publishWorkAsTemplate(workId, formData)
 * - 成功后 Taro.showToast + Taro.navigateBack
 */
import { useState, useCallback, useEffect } from 'react'
import { View, Text, Input, Textarea } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { LoadingState, ErrorState, IndustryPicker } from '@/components'
import { getWork, publishWorkAsTemplate } from '@/services/api/workbench.api'
import type { Work } from '@/types'
import './index.scss'

/** 平台选项 */
const PLATFORMS = ['抖音', '小红书', '视频号', '快手', 'B站']

/** 分类选项 */
const CATEGORIES = ['口播', '剧情', '测评', '教程', 'Vlog', '混剪']

/** 标签最大数量 */
const MAX_TAGS = 5

export default function PublishTemplatePage() {
  const instance = getCurrentInstance()
  const workId = instance.router?.params?.workId ?? ''

  const [work, setWork] = useState<Work | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [platform, setPlatform] = useState('')
  const [category, setCategory] = useState('')
  const [industries, setIndustries] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  /** 拉取作品信息 */
  const fetchWork = useCallback(async () => {
    if (!workId) {
      setError(true)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(false)
    try {
      const data = await getWork(workId)
      setWork(data)
      // 预填标题：取 prompt 的前 20 字
      const params = data.params as Record<string, unknown>
      const prompt = (params?.prompt as string) ?? ''
      setTitle(prompt ? prompt.slice(0, 20) : '')
    } catch (err) {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [workId])

  useEffect(() => {
    fetchWork()
  }, [fetchWork])

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

  /** 提交发布 */
  const handleSubmit = useCallback(async () => {
    if (!workId) return
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      Taro.showToast({ title: '请填写标题', icon: 'none' })
      return
    }
    if (submitting) return
    setSubmitting(true)
    try {
      await publishWorkAsTemplate(workId, {
        title: trimmedTitle,
        description: description.trim() || undefined,
        category: category || undefined,
        industry: industries[0] || undefined,
        platform: platform || undefined,
        tags: tags.length > 0 ? tags : undefined,
      })
      Taro.showToast({ title: '发布成功', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 800)
    } catch (err) {
      // 错误已由 request 层统一 toast
    } finally {
      setSubmitting(false)
    }
  }, [workId, title, description, category, industries, platform, tags, submitting])

  if (loading) {
    return (
      <View className="publish-tpl">
        <LoadingState fullScreen title="加载中..." />
      </View>
    )
  }

  if (error || !work) {
    return (
      <View className="publish-tpl">
        <ErrorState title="加载失败" description="作品不存在或加载失败" onRetry={fetchWork} />
      </View>
    )
  }

  const canSubmit = title.trim().length > 0 && !submitting

  return (
    <View className="publish-tpl page-wrap">
      {/* 顶部导航 */}
      <View className="publish-tpl__nav">
        <View className="publish-tpl__back" onClick={() => Taro.navigateBack()}>
          <Text>‹</Text>
        </View>
        <Text className="publish-tpl__nav-title">发布为模板</Text>
        <View className="publish-tpl__nav-placeholder" />
      </View>

      <View className="publish-tpl__body">
        {/* 作品预览 */}
        {work.resultUrl ? (
          <View className="publish-tpl__preview">
            {work.workType.includes('VIDEO') ||
            work.workType.includes('EXTEND') ||
            work.workType === 'EDIT_VIDEO' ? (
              <Text className="publish-tpl__preview-type">视频作品</Text>
            ) : (
              <Text className="publish-tpl__preview-type">图片作品</Text>
            )}
          </View>
        ) : null}

        {/* 标题 */}
        <View className="page-wrap__section">
          <Text className="page-wrap__label">
            标题<Text className="publish-tpl__required">*</Text>
          </Text>
          <View className="publish-tpl__input-wrap">
            <Input
              className="publish-tpl__input"
              value={title}
              placeholder="为模板起一个吸引人的标题"
              placeholderClass="publish-tpl__placeholder"
              maxlength={50}
              onInput={(e) => setTitle(e.detail.value)}
            />
          </View>
        </View>

        {/* 描述 */}
        <View className="page-wrap__section">
          <Text className="page-wrap__label">描述</Text>
          <View className="publish-tpl__textarea-wrap">
            <Textarea
              className="publish-tpl__textarea"
              value={description}
              placeholder="补充模板的使用场景、亮点或注意事项..."
              placeholderClass="publish-tpl__placeholder"
              maxlength={500}
              autoHeight
              onInput={(e) => setDescription(e.detail.value)}
            />
          </View>
        </View>

        {/* 平台 */}
        <View className="page-wrap__section">
          <Text className="page-wrap__label">适用平台</Text>
          <View className="page-wrap__row">
            {PLATFORMS.map((p) => (
              <View
                key={p}
                className={`page-wrap__chip ${platform === p ? 'page-wrap__chip--on' : ''}`}
                onClick={() => setPlatform(platform === p ? '' : p)}
              >
                <Text>{p}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 分类 */}
        <View className="page-wrap__section">
          <Text className="page-wrap__label">分类</Text>
          <View className="page-wrap__row">
            {CATEGORIES.map((c) => (
              <View
                key={c}
                className={`page-wrap__chip ${category === c ? 'page-wrap__chip--on' : ''}`}
                onClick={() => setCategory(category === c ? '' : c)}
              >
                <Text>{c}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 行业 */}
        <View className="page-wrap__section">
          <Text className="page-wrap__label">行业</Text>
          <IndustryPicker value={industries} onChange={setIndustries} max={1} min={0} />
        </View>

        {/* 标签 */}
        <View className="page-wrap__section">
          <Text className="page-wrap__label">
            标签（{tags.length}/{MAX_TAGS}）
          </Text>
          <View className="publish-tpl__tag-input">
            <Input
              className="publish-tpl__input publish-tpl__tag-input-field"
              value={tagInput}
              placeholder="输入标签后点击添加"
              placeholderClass="publish-tpl__placeholder"
              maxlength={20}
              onInput={(e) => setTagInput(e.detail.value)}
            />
            <View
              className={`publish-tpl__tag-add ${
                !tagInput.trim() ? 'publish-tpl__tag-add--disabled' : ''
              }`}
              onClick={handleAddTag}
            >
              <Text>添加</Text>
            </View>
          </View>
          {tags.length > 0 ? (
            <View className="publish-tpl__tag-list">
              {tags.map((tag) => (
                <View key={tag} className="publish-tpl__tag-item">
                  <Text className="publish-tpl__tag-text">{tag}</Text>
                  <Text className="publish-tpl__tag-remove" onClick={() => handleRemoveTag(tag)}>
                    ×
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      {/* 提交按钮 */}
      <View className="publish-tpl__footer">
        <View
          className={`page-wrap__btn publish-tpl__submit ${
            !canSubmit ? 'page-wrap__btn--disabled' : ''
          }`}
          onClick={handleSubmit}
        >
          <Text>{submitting ? '发布中...' : '发布到模板广场'}</Text>
        </View>
      </View>
    </View>
  )
}
