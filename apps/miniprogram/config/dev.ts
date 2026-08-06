import type { UserConfigExport } from '@tarojs/cli'

// 开发环境配置
// 文档：https://docs.taro.zone/docs/next/config#dev
export default {
  defineConstants: {
    API_BASE_URL: JSON.stringify(process.env.API_BASE_URL || 'http://localhost:3000/api'),
    WS_BASE_URL: JSON.stringify(process.env.WS_BASE_URL || 'ws://localhost:3008'),
  },
  logger: {
    quiet: false,
    stats: true,
  },
  mini: {
    // 开发环境关闭压缩，提升构建速度
    miniCssExtractPluginOption: {
      ignoreOrder: true,
    },
    webpackChain(chain: any) {
      chain.merge({
        devtool: 'cheap-module-source-map',
      })
    },
  },
  h5: {
    devServer: {
      open: false,
      port: 10086,
      host: 'localhost',
    },
  },
} satisfies UserConfigExport
