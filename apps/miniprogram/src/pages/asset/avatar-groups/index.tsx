import { useState, useCallback } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { EmptyState, LoadingState } from '@/components';
import {
  listAvatarGroups,
  deleteAvatarGroup,
  listAssets,
} from '@/services/api/asset.api';
import type { Asset, AvatarGroup } from '@/types';
import './index.scss';

/**
 * 真人形象组列表页
 *
 * 对应 FR7_02 - 真人形象资产组
 *
 * 功能：
 *  - 卡片式列表：名称、描述、资产数量、授权状态徽章、缩略图（前 4 张）
 *  - 点击卡片：展开组内资产网格
 *  - 长按删除：删除形象组（后端级联删除组内资产）
 *  - 空状态：EmptyState + 新建按钮
 *  - useDidShow：从新建页返回时自动刷新
 */

const AUTH_STATUS_MAP: Record<
  AvatarGroup['authorizationStatus'],
  { label: string; cls: string }
> = {
  PENDING: { label: '待授权', cls: 'avatar-card__badge--pending' },
  APPROVED: { label: '已授权', cls: 'avatar-card__badge--approved' },
  REJECTED: { label: '已拒绝', cls: 'avatar-card__badge--rejected' },
};

const THUMB_SLOTS = 4;

export default function AvatarGroupsIndex() {
  const [groups, setGroups] = useState<AvatarGroup[]>([]);
  // 每个形象组的前 4 张资产（用于缩略图展示）
  const [groupThumbs, setGroupThumbs] = useState<Record<string, Asset[]>>({});
  // 展开的形象组 ID（null 表示全部折叠）
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // 展开时加载的完整资产列表
  const [expandedAssets, setExpandedAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanding, setExpanding] = useState(false);

  /** 加载形象组列表 + 每组前 4 张缩略图 */
  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listAvatarGroups();
      setGroups(list);

      // 并行拉取每个形象组的前 4 张资产用于缩略图展示
      const thumbsEntries = await Promise.all(
        list
          .filter((g) => g.avatarCount > 0)
          .map(async (g) => {
            try {
              // avatarGroupId 由后端支持，但前端 listAssets 类型未声明，用变量绕过冗余属性检查
              const groupParams = {
                avatarGroupId: g.id,
                page: 1,
                pageSize: THUMB_SLOTS,
              };
              const res = await listAssets(groupParams);
              return [g.id, res.data.list] as [string, Asset[]];
            } catch {
              return [g.id, []] as [string, Asset[]];
            }
          }),
      );
      setGroupThumbs(Object.fromEntries(thumbsEntries));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[AvatarGroups] loadGroups failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 页面每次显示时刷新（包括从新建页返回）
  useDidShow(() => {
    loadGroups();
  });

  /** 展开/折叠形象组，展开时加载完整资产列表 */
  const handleToggleExpand = useCallback(
    async (group: AvatarGroup) => {
      if (expandedId === group.id) {
        setExpandedId(null);
        setExpandedAssets([]);
        return;
      }
      setExpandedId(group.id);
      setExpanding(true);
      try {
        const expandParams = {
          avatarGroupId: group.id,
          page: 1,
          pageSize: 100,
        };
        const res = await listAssets(expandParams);
        setExpandedAssets(res.data.list);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[AvatarGroups] load assets failed:', err);
        setExpandedAssets([]);
      } finally {
        setExpanding(false);
      }
    },
    [expandedId],
  );

  /** 长按删除形象组（后端级联删除组内资产） */
  const handleDelete = useCallback(async (group: AvatarGroup) => {
    const res = await Taro.showModal({
      title: '删除形象组',
      content: `确认删除「${group.name}」？组内所有素材将一并删除，不可恢复。`,
      confirmText: '删除',
      confirmColor: '#EF4444',
    });
    if (!res.confirm) return;
    try {
      await deleteAvatarGroup(group.id);
      Taro.showToast({ title: '已删除', icon: 'success' });
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
      setGroupThumbs((prev) => {
        const next = { ...prev };
        delete next[group.id];
        return next;
      });
      if (expandedId === group.id) {
        setExpandedId(null);
        setExpandedAssets([]);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[AvatarGroups] delete failed:', err);
    }
  }, [expandedId]);

  const handleGoCreate = useCallback(() => {
    Taro.navigateTo({ url: '/pages/asset/avatar-group-create/index' });
  }, []);

  const handleGoAssetList = useCallback(() => {
    Taro.navigateBack({ fail: () => {
      Taro.redirectTo({ url: '/pages/asset/index' });
    }});
  }, []);

  const isEmpty = !loading && groups.length === 0;

  return (
    <View className='avatar-page'>
      {/* 顶部导航 */}
      <View className='avatar-page__header'>
        <View className='avatar-page__back' onClick={handleGoAssetList}>
          <Text>←</Text>
        </View>
        <Text className='avatar-page__title'>真人形象</Text>
        <View className='avatar-page__create-btn' onClick={handleGoCreate}>
          <Text>+ 新建</Text>
        </View>
      </View>

      {/* 形象组列表 */}
      <View className='avatar-page__list'>
        {loading ? <LoadingState title='加载中...' /> : null}

        {isEmpty ? (
          <EmptyState
            title='暂无真人形象组'
            description='创建形象组来管理你的真人素材'
            icon='👤'
          />
        ) : (
          groups.map((group) => {
            const auth = AUTH_STATUS_MAP[group.authorizationStatus] ||
              AUTH_STATUS_MAP.PENDING;
            const thumbs = groupThumbs[group.id] || [];
            const isExpanded = expandedId === group.id;

            return (
              <View key={group.id} className='avatar-card'>
                <View
                  className='avatar-card__main'
                  onClick={() => handleToggleExpand(group)}
                  onLongPress={() => handleDelete(group)}
                >
                  {/* 缩略图 2x2 网格 */}
                  <View className='avatar-card__thumbs'>
                    {Array.from({ length: THUMB_SLOTS }).map((_, i) => {
                      const asset = thumbs[i];
                      return (
                        <View key={i} className='avatar-card__thumb-slot'>
                          {asset ? (
                            <>
                              <View className='avatar-card__thumb-placeholder'>
                                <Text>🖼️</Text>
                              </View>
                              {asset.assetType === 'IMAGE' &&
                              asset.storageKey ? (
                                <Image
                                  className='avatar-card__thumb-image'
                                  src={asset.storageKey}
                                  mode='aspectFill'
                                  lazyLoad
                                />
                              ) : null}
                            </>
                          ) : (
                            <View className='avatar-card__thumb-empty'>
                              <Text>{i === 0 && group.avatarCount > 0 ? group.avatarCount : ''}</Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>

                  {/* 信息区 */}
                  <View className='avatar-card__info'>
                    <View className='avatar-card__info-top'>
                      <Text className='avatar-card__name'>{group.name}</Text>
                      <View className={`avatar-card__badge ${auth.cls}`}>
                        <Text>{auth.label}</Text>
                      </View>
                    </View>
                    {group.description ? (
                      <Text className='avatar-card__desc'>{group.description}</Text>
                    ) : null}
                    <View className='avatar-card__meta'>
                      <Text className='avatar-card__count'>
                        {group.avatarCount} 张素材
                      </Text>
                      <Text className='avatar-card__expand'>
                        {isExpanded ? '收起 ▲' : '展开 ▼'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* 展开时显示完整资产列表 */}
                {isExpanded ? (
                  <View className='avatar-card__assets'>
                    {expanding ? (
                      <LoadingState title='加载中...' />
                    ) : expandedAssets.length === 0 ? (
                      <Text className='avatar-card__assets-empty'>暂无素材</Text>
                    ) : (
                      <View className='avatar-card__assets-grid'>
                        {expandedAssets.map((asset) => (
                          <View key={asset.id} className='avatar-card__asset-item'>
                            <View className='avatar-card__asset-thumb'>
                              <View className='avatar-card__thumb-placeholder'>
                                <Text>🖼️</Text>
                              </View>
                              {asset.assetType === 'IMAGE' &&
                              asset.storageKey ? (
                                <Image
                                  className='avatar-card__thumb-image'
                                  src={asset.storageKey}
                                  mode='aspectFill'
                                  lazyLoad
                                />
                              ) : null}
                            </View>
                            <Text className='avatar-card__asset-name'>
                              {asset.fileName}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </View>

      {/* 空状态时的新建按钮 */}
      {isEmpty ? (
        <View className='avatar-page__fab' onClick={handleGoCreate}>
          <Text className='avatar-page__fab-text'>+ 新建真人形象组</Text>
        </View>
      ) : null}
    </View>
  );
}
