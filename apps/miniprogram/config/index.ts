import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import path from 'path'
import devConfig from './dev'
import prodConfig from './prod'

// ReelClone Taro 构建配置
// 文档：https://docs.taro.zone/docs/next/config#defineconfig
export default defineConfig(async (merge) => {
  const baseConfig: UserConfigExport = {
    projectName: 'ReelClone',
    date: '2024-1-1',
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2,
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: [],
    defineConstants: {
      API_BASE_URL: JSON.stringify(
        process.env.API_BASE_URL ||
          (process.env.NODE_ENV === 'production' ? 'https://api.reelclone.com/api' : 'http://localhost:3000/api'),
      ),
      WS_BASE_URL: JSON.stringify(
        process.env.WS_BASE_URL ||
          (process.env.NODE_ENV === 'production' ? 'wss://api.reelclone.com' : 'ws://localhost:3008'),
      ),
    },
    copy: {
      patterns: [],
      options: {},
    },
    framework: 'react',
    compiler: 'webpack5',
    cache: {
      enable: false,
    },
    // SCSS 全局变量注入：在每个 SCSS 文件前自动引入变量与 mixins
    sass: {
      resource: [
        path.resolve(__dirname, '..', 'src', 'styles', 'variables.scss'),
        path.resolve(__dirname, '..', 'src', 'styles', 'mixins.scss'),
      ],
    },
    // 路径别名：@/ -> apps/miniprogram/src/
    alias: {
      '@': path.resolve(__dirname, '..', 'src'),
      '@reelclone/capability': path.resolve(__dirname, 'capability.ts'),
    },
    mini: {
      // 主包优化：将公共依赖提取到主包，减少分包体积
      optimizeMainPackage: {
        enable: true,
      },
      postcss: {
        pxtransform: {
          enable: true,
          config: {},
        },
        url: {
          enable: true,
          config: {
            limit: 1024,
          },
        },
        cssModules: {
          enable: true,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
      webpackChain(chain: any) {
        // 兼容 RxJS / 旧版 CommonJS 依赖
        chain.resolve.extensions.merge(['.ts', '.tsx', '.js', '.jsx', '.json'])
      },
    },
    h5: {
      router: {
        mode: 'browser',
      },
      devServer: {
        port: 10086,
        host: 'localhost',
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: true,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
    },
    rn: {
      appName: 'ReelClone',
      postcss: {
        cssModules: {
          enable: false,
        },
      },
    },
  }

  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, devConfig)
  }
  return merge({}, baseConfig, prodConfig)
})
