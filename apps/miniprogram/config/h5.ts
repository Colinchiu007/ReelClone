import type { UserConfigExport } from '@tarojs/cli'

/**
 * H5 专属构建配置（按需编译预置）
 *
 * 当 TARO_ENV === 'h5' 时由 config/index.ts 合并本配置。
 *
 * - router：browser 模式（URL 无 # 号）
 * - devServer：开发代理，将 /api、/ws 转发到后端网关，避免跨域。
 *   注意：H5 开发时前端请求应使用相对路径（如 /api/auth/wechat-login），
 *   即 API_BASE 在 H5 环境配置为 '/api'，而非绝对地址。
 * - postcss：cssModules 命名规则与小程序端保持一致
 */
export default {
  h5: {
    router: {
      mode: 'browser',
    },
    devServer: {
      port: 10086,
      host: 'localhost',
      proxy: {
        '/api': {
          target: process.env.API_BASE_URL || 'http://localhost:3000',
          changeOrigin: true,
        },
        '/ws': {
          target: process.env.WS_BASE_URL || 'ws://localhost:3008',
          ws: true,
        },
      },
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
} satisfies UserConfigExport
