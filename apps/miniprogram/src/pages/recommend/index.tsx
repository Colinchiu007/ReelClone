import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Input, ScrollView } from '@tarojs/components';
import Taro, { useLoad, useReachBottom } from '@tarojs/taro';
import {
  TemplateCard,
  IndustryPicker,
  LoadingState,
  ErrorState,
  EmptyState,
  type TemplateItem,
} from '@/components';
import {
  listTemplates,
  getIndustryPreferences,
  setIndustryPreferences,
} from '@/services/api/template.api';
import { PLATFORM_OPTIONS } from '@/utils/platform';
import './index.scss';

const PLATFORM_TABS = [{ value: '', label: '全部' }, ...PLATFORM_OPTIONS];

interface SortTab {
  key: string;
  label: string;
}

const SORT_TABS: SortTab[] = [
  { key: 'industry', label: '我的行业' },
  { key: 'heat', label: '热度' },
  { key: 'week', label: '最近一周' },
];

const PAGE_SIZE = 20;

export default function Index() {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [platform, setPlatform] = useState('');
  const [sortBy, setSortBy] = useState('heat');
  const [keyword, setKeyword] = useState('');
  const [industryModalVisible, setIndustryModalVisible] = useState(false);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const industryCheckedRef = useRef(false);
  const isFirstRender = useRef(true);

  const doSearch = useCallback(
    async (opts?: { reset?: boolean; nextPage?: number }) => {
      const reset = opts?.reset ?? true;
      const nextPage = opts?.nextPage ?? 1;
      const industry = sortBy === 'industry' ? selectedIndustries[0] : undefined;

      if (reset) {
        setLoading(true);
        setError(false);
      } else {
        setLoadingMore(true);
      }
      try {
        const res = await listTemplates({
          platform: platform || undefined,
          industry,
          sortBy,
          keyword: keyword || undefined,
          page: nextPage,
          pageSize: PAGE_SIZE,
        });
        const list = res.data.list as unknown as TemplateItem[];
        setTemplates((prev) => (reset ? list : [...prev, ...list]));
        setHasMore(list.length >= PAGE_SIZE);
        setPage(nextPage);
      } catch {
        if (reset) setError(true);
        else Taro.showToast({ title: '加载更多失败', icon: 'none' });
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [platform, sortBy, keyword, selectedIndustries],
  );

  const checkIndustryPreferences = useCallback(async () => {
    if (industryCheckedRef.current) return;
    industryCheckedRef.current = true;
    try {
      const industries = await getIndustryPreferences();
      if (!industries || industries.length === 0) {
        setIndustryModalVisible(true);
      } else {
        setSelectedIndustries(industries);
      }
    } catch {
      // 静默失败
    }
  }, []);

  useLoad(() => {
    Taro.setNavigationBarTitle({ title: '灵感广场' });
    doSearch();
    checkIndustryPreferences();
  });

  // platform / sortBy 变化时重新搜索（首次渲染跳过，由 useLoad 处理）
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    doSearch({ reset: true, nextPage: 1 });
  }, [platform, sortBy, doSearch]);

  useReachBottom(() => {
    if (!hasMore || loading || loadingMore) return;
    doSearch({ reset: false, nextPage: page + 1 });
  });

  const handlePlatformTap = (key: string) => {
    setPlatform(key);
  };

  const handleSortTap = (key: string) => {
    setSortBy(key);
  };

  const handleSearchConfirm = () => {
    doSearch({ reset: true, nextPage: 1 });
  };

  const handleTemplateClick = (id: string) => {
    Taro.navigateTo({ url: `/pages/template/detail/index?id=${id}` });
  };

  const handleIndustryConfirm = async () => {
    if (selectedIndustries.length === 0) {
      Taro.showToast({ title: '请至少选择 1 个行业', icon: 'none' });
      return;
    }
    try {
      await setIndustryPreferences(selectedIndustries);
      setIndustryModalVisible(false);
      doSearch({ reset: true, nextPage: 1 });
    } catch {
      Taro.showToast({ title: '保存失败，请重试', icon: 'none' });
    }
  };

  const handleIndustrySkip = () => {
    setIndustryModalVisible(false);
  };

  const leftCol = templates.filter((_, i) => i % 2 === 0);
  const rightCol = templates.filter((_, i) => i % 2 === 1);

  return (
    <View className='recommend'>
      <View className='recommend__search'>
        <Input
          className='recommend__search-input'
          type='text'
          placeholder='搜索灵感模板 / 作者 / 关键词'
          value={keyword}
          onInput={(e) => setKeyword(e.detail.value)}
          onConfirm={handleSearchConfirm}
          confirmType='search'
        />
        <View className='recommend__search-btn' onClick={handleSearchConfirm}>
          <Text>搜索</Text>
        </View>
      </View>

      <ScrollView className='recommend__platform-tabs' scrollX>
        {PLATFORM_TABS.map((tab) => (
          <View
            key={tab.value}
            className={`recommend__tab ${
              platform === tab.value ? 'recommend__tab--on' : ''
            }`}
            onClick={() => handlePlatformTap(tab.value)}
          >
            <Text>{tab.label}</Text>
          </View>
        ))}
      </ScrollView>

      <View className='recommend__sort-bar'>
        {SORT_TABS.map((tab) => (
          <View
            key={tab.key}
            className={`recommend__sort ${
              sortBy === tab.key ? 'recommend__sort--on' : ''
            }`}
            onClick={() => handleSortTap(tab.key)}
          >
            <Text>{tab.label}</Text>
          </View>
        ))}
      </View>

      <View className='recommend__list'>
        {loading ? (
          <LoadingState title='加载灵感中...' />
        ) : error ? (
          <ErrorState title='加载失败' onRetry={() => doSearch()} />
        ) : templates.length === 0 ? (
          <EmptyState title='暂无模板' description='换个筛选条件试试' />
        ) : (
          <View className='recommend__waterfall'>
            <View className='recommend__waterfall-col'>
              {leftCol.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onClick={handleTemplateClick}
                />
              ))}
            </View>
            <View className='recommend__waterfall-col'>
              {rightCol.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onClick={handleTemplateClick}
                />
              ))}
            </View>
          </View>
        )}

        {loadingMore && <LoadingState title='加载更多...' />}
        {!loading && !loadingMore && !hasMore && templates.length > 0 && (
          <View className='recommend__end'>
            <Text className='recommend__end-text'>—— 已经到底啦 ——</Text>
          </View>
        )}
      </View>

      {industryModalVisible && (
        <View className='recommend__modal'>
          <View className='recommend__modal-card'>
            <View className='recommend__modal-header'>
              <Text className='recommend__modal-title'>选择行业偏好</Text>
              <Text className='recommend__modal-desc'>
                我们将根据你的偏好推荐更精准的内容
              </Text>
            </View>
            <IndustryPicker
              value={selectedIndustries}
              onChange={setSelectedIndustries}
              max={3}
              min={1}
            />
            <View className='recommend__modal-actions'>
              <View className='recommend__modal-btn recommend__modal-btn--ghost' onClick={handleIndustrySkip}>
                <Text>跳过</Text>
              </View>
              <View className='recommend__modal-btn recommend__modal-btn--primary' onClick={handleIndustryConfirm}>
                <Text>确认</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
