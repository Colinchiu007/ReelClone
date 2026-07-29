import { useState, useEffect, useCallback } from 'react';
import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro, { useReachBottom } from '@tarojs/taro';
import { EmptyState, LoadingState, IndustryPicker } from '@/components';
import { listAssets, deleteAsset } from '@/services/api/asset.api';
import UploadModal from './upload-modal';
import type { Asset } from '@/types';
import './index.scss';

/**
 * 普通资产列表页（asset 分包入口）
 *
 * 对应 FR7_01 - 普通资产素材库
 *
 * 结构：
 *  - 顶部 Tab：普通资产 / 真人形象（点击真人形象跳转 avatar-groups）
 *  - 子 Tab：素材库 / 成品库
 *  - 筛选栏：资产类型（全部/图片/视频/音频）+ 行业筛选
 *  - 网格列表：3 列，缩略图 + 文件名
 *  - 悬浮上传按钮 → 弹出 UploadModal
 *  - 上拉加载更多（useReachBottom）
 *  - 长按删除（onLongPress + 确认框）
 */

type SubTab = 'material' | 'finished';
type TypeFilter = 'all' | 'IMAGE' | 'VIDEO' | 'AUDIO';

const PAGE_SIZE = 24;

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'IMAGE', label: '图片' },
  { value: 'VIDEO', label: '视频' },
  { value: 'AUDIO', label: '音频' },
];

const ASSET_TYPE_ICON: Record<string, string> = {
  IMAGE: '🖼️',
  VIDEO: '🎬',
  AUDIO: '🎵',
  MATERIAL: '📦',
  FINISHED: '✨',
};

export default function AssetIndex() {
  const [subTab, setSubTab] = useState<SubTab>('material');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [industry, setIndustry] = useState<string>('');
  const [industryOpen, setIndustryOpen] = useState(false);
  const [list, setList] = useState<Asset[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploadVisible, setUploadVisible] = useState(false);

  const hasMore = list.length < total;

  /** 构造查询参数：成品库固定 FINISHED，素材库按类型筛选 */
  const buildQuery = useCallback(
    (pageNum: number): Record<string, unknown> => {
      const params: Record<string, unknown> = {
        page: pageNum,
        pageSize: PAGE_SIZE,
      };
      if (subTab === 'finished') {
        params.assetType = 'FINISHED';
      } else if (typeFilter !== 'all') {
        params.assetType = typeFilter;
      }
      if (industry) {
        params.industry = industry;
      }
      return params;
    },
    [subTab, typeFilter, industry],
  );

  const loadList = useCallback(
    async (pageNum: number, append: boolean) => {
      setLoading(true);
      try {
        const res = await listAssets(buildQuery(pageNum));
        const next = res.data;
        setList((prev) => (append ? [...prev, ...next.list] : next.list));
        setPage(next.page);
        setTotal(next.total);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[AssetIndex] loadList failed:', err);
      } finally {
        setLoading(false);
      }
    },
    [buildQuery],
  );

  // 筛选条件变化时重新加载第一页
  useEffect(() => {
    loadList(1, false);
  }, [loadList]);

  // 上拉加载更多
  useReachBottom(() => {
    if (loading || !hasMore) return;
    loadList(page + 1, true);
  });

  const handleRefresh = useCallback(() => {
    loadList(1, false);
  }, [loadList]);

  const handleGoAvatarGroups = useCallback(() => {
    Taro.navigateTo({ url: '/pages/asset/avatar-groups/index' });
  }, []);

  const handleOpenUpload = useCallback(() => {
    setUploadVisible(true);
  }, []);

  const handleCloseUpload = useCallback(() => {
    setUploadVisible(false);
  }, []);

  const handleDelete = useCallback(async (asset: Asset) => {
    const res = await Taro.showModal({
      title: '删除资产',
      content: `确认删除「${asset.fileName}」？删除后不可恢复。`,
      confirmText: '删除',
      confirmColor: '#EF4444',
    });
    if (!res.confirm) return;
    try {
      await deleteAsset(asset.id);
      Taro.showToast({ title: '已删除', icon: 'success' });
      setList((prev) => prev.filter((a) => a.id !== asset.id));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[AssetIndex] delete failed:', err);
    }
  }, []);

  const isEmpty = !loading && list.length === 0;

  return (
    <View className='asset-page'>
      {/* 顶部 Tab：普通资产 / 真人形象 */}
      <View className='asset-page__top-tabs'>
        <View className='asset-page__top-tab asset-page__top-tab--active'>
          <Text>普通资产</Text>
        </View>
        <View className='asset-page__top-tab' onClick={handleGoAvatarGroups}>
          <Text>真人形象</Text>
        </View>
      </View>

      {/* 子 Tab：素材库 / 成品库 */}
      <View className='asset-page__sub-tabs'>
        <View
          className={`asset-page__sub-tab ${
            subTab === 'material' ? 'asset-page__sub-tab--on' : ''
          }`}
          onClick={() => setSubTab('material')}
        >
          <Text>素材库</Text>
        </View>
        <View
          className={`asset-page__sub-tab ${
            subTab === 'finished' ? 'asset-page__sub-tab--on' : ''
          }`}
          onClick={() => setSubTab('finished')}
        >
          <Text>成品库</Text>
        </View>
      </View>

      {/* 筛选栏 */}
      <View className='asset-page__filter'>
        <ScrollView className='asset-page__type-filters' scrollX>
          {TYPE_FILTERS.map((tf) => (
            <View
              key={tf.value}
              className={`asset-page__type-filter ${
                typeFilter === tf.value ? 'asset-page__type-filter--on' : ''
              }`}
              onClick={() => setTypeFilter(tf.value)}
            >
              <Text>{tf.label}</Text>
            </View>
          ))}
        </ScrollView>
        <View
          className={`asset-page__industry-btn ${
            industry ? 'asset-page__industry-btn--on' : ''
          }`}
          onClick={() => setIndustryOpen((v) => !v)}
        >
          <Text>{industry || '行业'}</Text>
          <Text className='asset-page__industry-arrow'>
            {industryOpen ? '▲' : '▼'}
          </Text>
        </View>
      </View>

      {/* 行业筛选面板（展开时显示） */}
      {industryOpen ? (
        <View className='asset-page__industry-panel'>
          <IndustryPicker
            value={industry ? [industry] : []}
            onChange={(vals) => {
              setIndustry(vals[0] || '');
              setIndustryOpen(false);
            }}
            max={1}
            min={0}
          />
        </View>
      ) : null}

      {/* 资产列表 */}
      <View className='asset-page__list'>
        {isEmpty ? (
          <EmptyState
            title='暂无资产'
            description='点击右下角按钮上传你的第一个素材'
            icon='📦'
          />
        ) : (
          <View className='asset-page__grid'>
            {list.map((asset) => (
              <View
                key={asset.id}
                className='asset-card'
                onLongPress={() => handleDelete(asset)}
              >
                <View className='asset-card__thumb'>
                  <View className='asset-card__placeholder'>
                    <Text className='asset-card__icon'>
                      {ASSET_TYPE_ICON[asset.assetType] || '📄'}
                    </Text>
                  </View>
                  {asset.assetType === 'IMAGE' && asset.storageKey ? (
                    <Image
                      className='asset-card__image'
                      src={asset.storageKey}
                      mode='aspectFill'
                      lazyLoad
                    />
                  ) : null}
                  <View className='asset-card__type-badge'>
                    <Text>{asset.assetType}</Text>
                  </View>
                </View>
                <Text className='asset-card__name'>{asset.fileName}</Text>
              </View>
            ))}
          </View>
        )}
        {loading ? <LoadingState title='加载中...' /> : null}
        {!loading && !isEmpty && !hasMore ? (
          <View className='asset-page__end'>
            <Text>没有更多了</Text>
          </View>
        ) : null}
      </View>

      {/* 悬浮上传按钮 */}
      <View className='asset-page__fab' onClick={handleOpenUpload}>
        <Text className='asset-page__fab-icon'>+</Text>
      </View>

      {/* 上传素材弹窗 */}
      <UploadModal
        visible={uploadVisible}
        onClose={handleCloseUpload}
        onUploaded={handleRefresh}
      />
    </View>
  );
}
