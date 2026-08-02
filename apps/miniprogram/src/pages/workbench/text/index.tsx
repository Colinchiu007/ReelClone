/**
 * 文本生成工作台
 * 对应 FR2_文本生成_01_对话模式工作台
 *
 * - Tab 切换：对话模式 / 一键改写
 * - 对话模式：消息列表 + PromptInput + 行业标签快捷填充
 * - 一键改写：原文输入 + 改写按钮
 * - 积分：5 积分/次
 */
import { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Textarea } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { CreditBadge, PromptInput } from '@/components';
import { useCredits } from '@/hooks/useCredits';
import { createGeneration } from '@/services/api/workbench.api';
import { usePointsStore } from '@/stores/points.store';
import { GenerationType, getFixedPoints } from '@/utils/capabilities';
import './index.scss';

const TYPE = GenerationType.TEXT_GENERATE;
/** 单次文本生成消耗积分 */
const POINTS_PER_CALL = getFixedPoints(TYPE) ?? 5;

/** 对话模式行业快捷标签 */
const INDUSTRY_TAGS = ['好物种草', '本地生活', '教育培训', 'IP 口播'];

/** 消息类型 */
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
}

type TabKey = 'chat' | 'rewrite';

export default function TextWorkbench() {
  const [tab, setTab] = useState<TabKey>('chat');
  const [prompt, setPrompt] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [rewriteResult, setRewriteResult] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const scrollViewRef = useRef<string>('');

  const { balance } = useCredits();
  const consume = usePointsStore((s) => s.consume);

  /** 滚动到底部 */
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollViewRef.current = `msg-${Date.now()}`;
    }, 50);
  }, []);

  /** 对话模式：发送消息 */
  const handleChatSend = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      Taro.showToast({ title: '请输入提示词', icon: 'none' });
      return;
    }
    if (balance < POINTS_PER_CALL) {
      Taro.showToast({ title: '积分不足', icon: 'none' });
      return;
    }

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };
    const assistantMsg: ChatMessage = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: '',
      pending: true,
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setPrompt('');
    setSubmitting(true);
    scrollToBottom();

    try {
      const res = await createGeneration({
        generationType: 'TEXT_GENERATE',
        prompt: trimmed,
      });
      consume(POINTS_PER_CALL);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: `已提交生成任务（workId: ${res.workId}）`, pending: false }
            : m,
        ),
      );
      Taro.showToast({ title: '生成任务已提交', icon: 'success' });
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: '生成失败，请重试', pending: false }
            : m,
        ),
      );
    } finally {
      setSubmitting(false);
      scrollToBottom();
    }
  }, [prompt, balance, consume, scrollToBottom]);

  /** 一键改写 */
  const handleRewrite = useCallback(async () => {
    const trimmed = originalText.trim();
    if (!trimmed) {
      Taro.showToast({ title: '请输入原文', icon: 'none' });
      return;
    }
    if (balance < POINTS_PER_CALL) {
      Taro.showToast({ title: '积分不足', icon: 'none' });
      return;
    }

    setSubmitting(true);
    setRewriteResult('');
    try {
      const res = await createGeneration({
        generationType: 'TEXT_GENERATE',
        prompt: trimmed,
        model: 'rewrite',
      });
      consume(POINTS_PER_CALL);
      setRewriteResult(`改写任务已提交（workId: ${res.workId}）`);
      Taro.showToast({ title: '改写任务已提交', icon: 'success' });
    } catch (err) {
      setRewriteResult('改写失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }, [originalText, balance, consume]);

  /** 行业标签点击：追加到 prompt */
  const handleIndustryTag = useCallback(
    (tag: string) => {
      setPrompt((prev) => (prev.trim() ? `${prev.trim()}，${tag}` : tag));
    },
    [],
  );

  return (
    <View className='text-wb page-wrap'>
      {/* 顶部：标题 + 积分余额 */}
      <View className='page-wrap__header'>
        <Text className='page-wrap__title'>文本生成</Text>
        <View className='page-wrap__credits'>
          <CreditBadge amount={balance} size='sm' />
          <Text className='text-wb__cost'>{POINTS_PER_CALL} 积分/次</Text>
        </View>
      </View>

      {/* Tab 切换 */}
      <View className='text-wb__tabs'>
        <View
          className={`text-wb__tab ${tab === 'chat' ? 'text-wb__tab--on' : ''}`}
          onClick={() => setTab('chat')}
        >
          <Text>对话模式</Text>
        </View>
        <View
          className={`text-wb__tab ${tab === 'rewrite' ? 'text-wb__tab--on' : ''}`}
          onClick={() => setTab('rewrite')}
        >
          <Text>一键改写</Text>
        </View>
      </View>

      {/* 对话模式 */}
      {tab === 'chat' ? (
        <View className='text-wb__chat'>
          <ScrollView
            className='text-wb__msg-list'
            scrollY
            scrollIntoView={scrollViewRef.current}
          >
            {messages.length === 0 ? (
              <View className='text-wb__empty'>
                <Text>输入你的需求，开始生成文本内容</Text>
              </View>
            ) : (
              messages.map((m) => (
                <View
                  key={m.id}
                  id={m.id}
                  className={`text-wb__msg text-wb__msg--${m.role}`}
                >
                  <Text className='text-wb__msg-role'>
                    {m.role === 'user' ? '我' : 'AI'}
                  </Text>
                  <View className='text-wb__msg-bubble'>
                    <Text>{m.pending ? '生成中...' : m.content}</Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          <View className='text-wb__input-area'>
            <PromptInput
              value={prompt}
              onChange={setPrompt}
              maxLength={2000}
              placeholder='描述你想要的文案风格、内容主题...'
              industryTags={INDUSTRY_TAGS}
              onIndustryTagClick={handleIndustryTag}
            />
            <View
              className={`page-wrap__btn text-wb__send ${
                submitting || !prompt.trim() ? 'page-wrap__btn--disabled' : ''
              }`}
              onClick={handleChatSend}
            >
              <Text>{submitting ? '发送中...' : '发送（5积分）'}</Text>
            </View>
          </View>
        </View>
      ) : (
        /* 一键改写 */
        <View className='text-wb__rewrite'>
          <View className='text-wb__section'>
            <Text className='text-wb__section-title'>原文</Text>
            <View className='text-wb__textarea-wrap'>
              <Textarea
                className='text-wb__textarea'
                value={originalText}
                placeholder='粘贴或输入需要改写的原文内容...'
                maxlength={5000}
                autoHeight
                onInput={(e) => setOriginalText(e.detail.value)}
              />
            </View>
          </View>

          <View
            className={`page-wrap__btn ${
              submitting || !originalText.trim() ? 'page-wrap__btn--disabled' : ''
            }`}
            onClick={handleRewrite}
          >
            <Text>{submitting ? '改写中...' : '改写（5积分）'}</Text>
          </View>

          {rewriteResult ? (
            <View className='text-wb__section'>
              <Text className='text-wb__section-title'>改写结果</Text>
              <View className='text-wb__result'>
                <Text>{rewriteResult}</Text>
              </View>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}
