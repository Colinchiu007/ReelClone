import { View, Text, Image } from '@tarojs/components'
import './index.scss'

/**
 * TemplateCard 模板卡片
 * 用于灵感广场、模板列表展示
 *
 * 支持展示上传者信息（FR-06/FR-07）：
 *  - 头像 + 昵称
 *  - 上传模板数 + 被使用数
 */

export interface TemplateItem {
  id: string
  title: string
  coverUrl?: string
  platform?: string
  author?: string
  /** 上传者用户 ID（点击头像跳转主页） */
  authorId?: string
  /** 上传者头像 URL */
  authorAvatar?: string
  /** 上传者已上传模板数 */
  authorUploadCount?: number
  /** 上传者模板被使用总数 */
  authorUsedCount?: number
  playCount?: number
  iqScore?: number
  isFavorited?: boolean
}

export interface TemplateCardProps {
  template: TemplateItem
  onClick?: (id: string) => void
  onFavorite?: (id: string, next: boolean) => void
  /** 点击上传者区域回调（跳转用户主页） */
  onAuthorClick?: (authorId: string) => void
}

function formatPlay(n?: number): string {
  if (typeof n !== 'number' || n <= 0) return '0'
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}亿`
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return String(n)
}

export default function TemplateCard({
  template,
  onClick,
  onFavorite,
  onAuthorClick,
}: TemplateCardProps) {
  const handleTap = () => onClick?.(template.id)

  const handleFav = (e: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.()
    onFavorite?.(template.id, !template.isFavorited)
  }

  const handleAuthorTap = (e: { stopPropagation?: () => void }) => {
    // 仅当存在 authorId 时才允许点击跳转
    if (!template.authorId) return
    e?.stopPropagation?.()
    onAuthorClick?.(template.authorId)
  }

  // 是否展示上传者统计（至少有一个统计数据才展示）
  const hasAuthorStats =
    typeof template.authorUploadCount === 'number' || typeof template.authorUsedCount === 'number'

  return (
    <View className="template-card" onClick={handleTap}>
      <View className="template-card__cover">
        {template.coverUrl ? (
          <Image
            className="template-card__image"
            src={template.coverUrl}
            mode="aspectFill"
            lazyLoad
          />
        ) : (
          <View className="template-card__placeholder">模板</View>
        )}
        {template.platform ? (
          <View className="template-card__platform">{template.platform}</View>
        ) : null}
        <View
          className={`template-card__fav ${template.isFavorited ? 'template-card__fav--on' : ''}`}
          onClick={handleFav}
        >
          <Text>{template.isFavorited ? '♥' : '♡'}</Text>
        </View>
      </View>
      <View className="template-card__body">
        <Text className="template-card__title">{template.title}</Text>

        {/* 上传者信息行：头像 + 昵称 + 统计 */}
        {template.author ? (
          <View
            className={`template-card__author-row ${
              template.authorId ? 'template-card__author-row--clickable' : ''
            }`}
            onClick={handleAuthorTap}
          >
            {template.authorAvatar ? (
              <Image
                className="template-card__author-avatar"
                src={template.authorAvatar}
                mode="aspectFill"
                lazyLoad
              />
            ) : (
              <View className="template-card__author-avatar template-card__author-avatar--placeholder">
                <Text>{template.author.slice(0, 1)}</Text>
              </View>
            )}
            <Text className="template-card__author">@{template.author}</Text>
            {hasAuthorStats ? (
              <View className="template-card__author-stats">
                {typeof template.authorUploadCount === 'number' ? (
                  <Text className="template-card__author-stat">
                    上传 {formatPlay(template.authorUploadCount)}
                  </Text>
                ) : null}
                {typeof template.authorUsedCount === 'number' ? (
                  <Text className="template-card__author-stat">
                    被用 {formatPlay(template.authorUsedCount)}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        <View className="template-card__meta">
          <Text className="template-card__plays">▶ {formatPlay(template.playCount)}</Text>
        </View>
        {typeof template.iqScore === 'number' ? (
          <View className="template-card__iq">
            <Text className="template-card__iq-label">IQ</Text>
            <Text className="template-card__iq-value">{template.iqScore}</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}
