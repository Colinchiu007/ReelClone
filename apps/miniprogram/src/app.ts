import { PropsWithChildren } from 'react';
import { useLaunch } from '@tarojs/taro';
import './app.scss';

/**
 * ReelClone 小程序应用入口
 * 注意：本文件不包含 JSX，因此使用 .ts 扩展名。
 * 业务页面通过 children 渲染，全局状态由 Zustand store 管理。
 */
function App({ children }: PropsWithChildren<Record<string, unknown>>) {
  useLaunch(() => {
    // eslint-disable-next-line no-console
    console.info('ReelClone 小程序启动');
  });

  // 全局 children 即当前路由页面组件
  return children;
}

export default App;
