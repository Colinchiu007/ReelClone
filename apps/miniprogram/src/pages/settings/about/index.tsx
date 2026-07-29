/**
 * 关于页
 * 对应 FR11_关于_01_关于弹窗
 *
 * - 应用 Logo
 * - 应用名：ReelClone
 * - 版本号
 * - 简介
 * - ICP 备案号
 * - 用户协议入口
 * - 隐私协议入口
 */
import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import './index.scss';

/** 应用版本号 */
const APP_VERSION = '1.0.0';

/** 应用简介 */
const APP_DESCRIPTION =
  'ReelClone 是一款面向内容创作者的 AI 视频创作工具，提供文本生成、图片生成、视频生成、对标解析等一站式 AI 创作能力，助力短视频内容高效产出。';

/** ICP 备案号 */
const ICP_NUMBER = '粤ICP备2026062569号';

export default function AboutPage() {
  /** 跳转隐私协议 */
  const handleNavigatePrivacy = () => {
    Taro.navigateTo({ url: '/pages/settings/privacy/index' });
  };

  /** 跳转用户协议 */
  const handleNavigateAgreement = () => {
    Taro.navigateTo({ url: '/pages/settings/user-agreement/index' });
  };

  return (
    <View className='about-page'>
      <ScrollView scrollY className='about-page__scroll'>
        {/* Logo + 应用名 */}
        <View className='about-page__head'>
          <View className='about-page__logo'>
            <Text className='about-page__logo-text'>RC</Text>
          </View>
          <Text className='about-page__name'>ReelClone</Text>
          <Text className='about-page__version'>v{APP_VERSION}</Text>
        </View>

        {/* 简介 */}
        <View className='about-page__section'>
          <Text className='about-page__section-title'>应用简介</Text>
          <Text className='about-page__desc'>{APP_DESCRIPTION}</Text>
        </View>

        {/* 协议入口 */}
        <View className='about-page__section'>
          <Text className='about-page__section-title'>协议与条款</Text>
          <View className='about-page__group'>
            <View className='about-page__item' onClick={handleNavigateAgreement}>
              <Text className='about-page__item-label'>用户协议</Text>
              <Text className='about-page__item-arrow'>›</Text>
            </View>
            <View className='about-page__item about-page__item--last' onClick={handleNavigatePrivacy}>
              <Text className='about-page__item-label'>隐私协议</Text>
              <Text className='about-page__item-arrow'>›</Text>
            </View>
          </View>
        </View>

        {/* 备案号 */}
        <View className='about-page__footer'>
          <Text className='about-page__icp'>{ICP_NUMBER}</Text>
          <Text className='about-page__copyright'>© 2024 ReelClone. All Rights Reserved.</Text>
        </View>
      </ScrollView>
    </View>
  );
}
