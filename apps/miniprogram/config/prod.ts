import type { UserConfigExport } from '@tarojs/cli'

// 生产环境配置
// 文档：https://docs.taro.zone/docs/next/config#prod
export default {
  defineConstants: {
    API_BASE_URL: JSON.stringify(process.env.API_BASE_URL || 'https://api.reelclone.com/api'),
    WS_BASE_URL: JSON.stringify(process.env.WS_BASE_URL || 'wss://api.reelclone.com'),
  },
  mini: {
    // 生产环境开启 Tree Shaking 与压缩
    webpackChain(chain: any) {
      chain.merge({
        optimization: {
          minimize: true,
        },
      })
    },
  },
  h5: {
    // 生产构建开启压缩
    webpackChain(chain: any) {
      chain.merge({
        optimization: {
          minimize: true,
        },
      })
    },
  },
} satisfies UserConfigExport
