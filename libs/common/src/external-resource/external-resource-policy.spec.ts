/**
 * ExternalResourcePolicyService 单元测试
 *
 * 覆盖场景（Task E1.3）：
 *  1. 正常路径：允许域名通过
 *  2. SSRF 防护：私网/回环/元数据地址拒绝
 *  3. scheme 验证：非 http/https 拒绝
 *  4. redirect escape：redirect 到私网/链过长拒绝
 *  5. 未知平台：非 allowlist 域名拒绝
 *  6. IPv6 私网：::1 / fe80:: 拒绝
 *  7. 子域名匹配：www.youtube.com 通过，evil-youtube.com 拒绝
 */
import {
  ExternalResourcePolicyService,
  ExternalResourceError,
  ExternalResourceErrorCode,
} from './external-resource-policy'

describe('ExternalResourcePolicyService', () => {
  let policy: ExternalResourcePolicyService

  beforeEach(() => {
    policy = new ExternalResourcePolicyService()
  })

  // -------------------- 1. 正常路径 --------------------
  describe('正常路径 — 允许域名通过', () => {
    it.each([
      ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'YouTube'],
      ['https://youtube.com/watch?v=abc123', 'YouTube 无 www'],
      ['https://youtu.be/abc123', 'youtu.be 短链'],
      ['https://www.bilibili.com/video/BV1xx411c7mD', 'Bilibili'],
      ['https://bilibili.com/video/BV1xx411c7mD', 'Bilibili 无 www'],
      ['https://m.bilibili.com/video/BV1xx411c7mD', 'Bilibili 移动版'],
      ['https://b23.tv/abc123', 'b23.tv 短链'],
      ['https://www.douyin.com/video/123456', '抖音'],
      ['https://v.douyin.com/abc123/', '抖音短链'],
      ['https://iesdouyin.com/share/video/123', 'iesdouyin'],
      ['https://www.kuaishou.com/short-video/abc', '快手'],
      ['https://www.xiaohongshu.com/explore/abc', '小红书'],
      ['https://xhslink.com/abc', '小红书短链'],
      ['https://weibo.com/1234567890/abc', '微博'],
      ['https://weibo.cn/abc', '微博移动'],
    ])('应允许 %s (%s)', (url) => {
      expect(() => policy.validateUrl(url)).not.toThrow()
    })

    it('应允许 http 协议', () => {
      expect(() => policy.validateUrl('http://www.youtube.com/watch?v=abc')).not.toThrow()
    })

    it('应允许带端口、查询参数、fragment 的 URL', () => {
      expect(() =>
        policy.validateUrl('https://www.youtube.com:443/watch?v=abc&t=10#fragment'),
      ).not.toThrow()
    })
  })

  // -------------------- 2. SSRF 防护 --------------------
  describe('SSRF 防护 — 私网/回环/保留地址拒绝', () => {
    it.each([
      ['http://127.0.0.1/', 'loopback 127.0.0.1'],
      ['http://127.0.0.1:8080/', 'loopback 带端口'],
      ['http://127.1.2.3/', 'loopback 127.x.x.x'],
      ['http://10.0.0.1/', 'private 10.x'],
      ['http://10.255.255.255/', 'private 10.x 边界'],
      ['http://172.16.0.1/', 'private 172.16.x'],
      ['http://172.31.255.255/', 'private 172.31.x 边界'],
      ['http://192.168.1.1/', 'private 192.168.x'],
      ['http://192.168.0.0/', 'private 192.168.x 起始'],
      ['http://169.254.169.254/latest/meta-data/', 'AWS/GCP 元数据服务'],
      ['http://169.254.0.1/', 'link-local 169.254.x'],
      ['http://100.100.100.200/', '阿里云元数据服务'],
      ['http://100.64.0.1/', 'CGNAT 100.64.x'],
      ['http://0.0.0.0/', 'current-network 0.x'],
      ['http://0.0.0.0:8080/', 'current-network 带端口'],
    ])('应拒绝 %s (%s)', (url) => {
      expect(() => policy.validateUrl(url)).toThrow(ExternalResourceError)
      try {
        policy.validateUrl(url)
      } catch (err) {
        expect(err).toBeInstanceOf(ExternalResourceError)
        expect((err as ExternalResourceError).code).toBe(ExternalResourceErrorCode.PRIVATE_ADDRESS)
      }
    })

    it('应拒绝 172.32.0.1（不在 172.16.0.0/12 范围，但不在 allowlist）', () => {
      // 172.32.0.1 不在私网范围，但也不在 allowlist，应被 HOST_NOT_ALLOWED 拒绝
      expect(() => policy.validateUrl('http://172.32.0.1/')).toThrow(ExternalResourceError)
      try {
        policy.validateUrl('http://172.32.0.1/')
      } catch (err) {
        expect((err as ExternalResourceError).code).toBe(ExternalResourceErrorCode.HOST_NOT_ALLOWED)
      }
    })

    it('isPrivateAddress 应正确识别私网 IPv4', () => {
      expect(policy.isPrivateAddress('127.0.0.1')).toBe(true)
      expect(policy.isPrivateAddress('10.0.0.1')).toBe(true)
      expect(policy.isPrivateAddress('172.16.0.1')).toBe(true)
      expect(policy.isPrivateAddress('172.31.255.255')).toBe(true)
      expect(policy.isPrivateAddress('192.168.1.1')).toBe(true)
      expect(policy.isPrivateAddress('169.254.169.254')).toBe(true)
      expect(policy.isPrivateAddress('100.100.100.200')).toBe(true)
      expect(policy.isPrivateAddress('100.64.0.1')).toBe(true)
      expect(policy.isPrivateAddress('0.0.0.0')).toBe(true)
    })

    it('isPrivateAddress 应放行公网 IPv4', () => {
      expect(policy.isPrivateAddress('8.8.8.8')).toBe(false)
      expect(policy.isPrivateAddress('1.1.1.1')).toBe(false)
      expect(policy.isPrivateAddress('172.32.0.1')).toBe(false)
      expect(policy.isPrivateAddress('11.0.0.1')).toBe(false)
    })

    it('isPrivateAddress 应对非法 IP 返回 false', () => {
      expect(policy.isPrivateAddress('')).toBe(false)
      expect(policy.isPrivateAddress('not-an-ip')).toBe(false)
      expect(policy.isPrivateAddress('999.999.999.999')).toBe(false)
    })
  })

  // -------------------- 3. scheme 验证 --------------------
  describe('scheme 验证 — 非 http/https 拒绝', () => {
    it.each([
      ['file:///etc/passwd', 'file scheme'],
      ['ftp://example.com/file', 'ftp scheme'],
      ['javascript:alert(1)', 'javascript scheme'],
      ['data:text/html,<script>alert(1)</script>', 'data scheme'],
      ['gopher://localhost:6379/', 'gopher scheme'],
      ['dict://localhost:11211/', 'dict scheme'],
    ])('应拒绝 %s (%s)', (url) => {
      try {
        policy.validateUrl(url)
        fail(`Expected ${url} to be rejected`)
      } catch (err) {
        expect(err).toBeInstanceOf(ExternalResourceError)
        const code = (err as ExternalResourceError).code
        // file/javascript/data 等 scheme 可能被 URL 解析为 INVALID_URL 或 SCHEME_NOT_ALLOWED
        expect([
          ExternalResourceErrorCode.SCHEME_NOT_ALLOWED,
          ExternalResourceErrorCode.INVALID_URL,
        ]).toContain(code)
      }
    })
  })

  // -------------------- 4. redirect escape --------------------
  describe('redirect escape — redirect 到私网/链过长拒绝', () => {
    it('应拒绝 youtube.com redirect 到 127.0.0.1', () => {
      const from = 'https://www.youtube.com/watch?v=abc'
      const to = 'http://127.0.0.1/'
      expect(() => policy.validateRedirect(from, to)).toThrow(ExternalResourceError)
      try {
        policy.validateRedirect(from, to)
      } catch (err) {
        expect((err as ExternalResourceError).code).toBe(
          ExternalResourceErrorCode.REDIRECT_TO_PRIVATE,
        )
      }
    })

    it('应拒绝 redirect 到 169.254.169.254 元数据服务', () => {
      const from = 'https://www.bilibili.com/video/abc'
      const to = 'http://169.254.169.254/latest/meta-data/'
      expect(() => policy.validateRedirect(from, to)).toThrow(ExternalResourceError)
      try {
        policy.validateRedirect(from, to)
      } catch (err) {
        expect((err as ExternalResourceError).code).toBe(
          ExternalResourceErrorCode.REDIRECT_TO_PRIVATE,
        )
      }
    })

    it('应拒绝 redirect 链超过 5 跳', () => {
      const from = 'https://www.youtube.com/watch?v=abc'
      const to = 'https://www.youtube.com/redirect?target=next'
      // depth=5 应通过
      expect(() => policy.validateRedirect(from, to, 5)).not.toThrow()
      // depth=6 应拒绝
      expect(() => policy.validateRedirect(from, to, 6)).toThrow(ExternalResourceError)
      try {
        policy.validateRedirect(from, to, 6)
      } catch (err) {
        expect((err as ExternalResourceError).code).toBe(
          ExternalResourceErrorCode.REDIRECT_CHAIN_TOO_LONG,
        )
      }
    })

    it('应拒绝 redirect 到未知平台', () => {
      const from = 'https://www.youtube.com/watch?v=abc'
      const to = 'https://evil.com/steal'
      expect(() => policy.validateRedirect(from, to)).toThrow(ExternalResourceError)
      try {
        policy.validateRedirect(from, to)
      } catch (err) {
        expect((err as ExternalResourceError).code).toBe(ExternalResourceErrorCode.HOST_NOT_ALLOWED)
      }
    })

    it('应允许 redirect 到同 allowlist 域名', () => {
      expect(() =>
        policy.validateRedirect('https://youtu.be/abc', 'https://www.youtube.com/watch?v=abc'),
      ).not.toThrow()
    })

    it('应拒绝 redirect 到 file scheme', () => {
      expect(() =>
        policy.validateRedirect('https://www.youtube.com/', 'file:///etc/passwd'),
      ).toThrow(ExternalResourceError)
    })
  })

  // -------------------- 5. 未知平台 --------------------
  describe('未知平台 — 非 allowlist 域名拒绝', () => {
    it.each([
      ['https://unknown-platform.com/video/123'],
      ['https://evil.com/steal'],
      ['https://attacker.example.com/exploit'],
      ['https://phishing-site.net/login'],
    ])('应拒绝 %s', (url) => {
      expect(() => policy.validateUrl(url)).toThrow(ExternalResourceError)
      try {
        policy.validateUrl(url)
      } catch (err) {
        expect((err as ExternalResourceError).code).toBe(ExternalResourceErrorCode.HOST_NOT_ALLOWED)
      }
    })
  })

  // -------------------- 6. IPv6 私网 --------------------
  describe('IPv6 私网 — ::1 / fe80:: 拒绝', () => {
    it.each([
      ['http://[::1]/', 'IPv6 loopback ::1'],
      ['http://[::1]:8080/', 'IPv6 loopback 带端口'],
      ['http://[fe80::1]/', 'IPv6 link-local fe80::'],
      ['http://[fc00::1]/', 'IPv6 unique-local fc00::'],
      ['http://[fd00::1]/', 'IPv6 unique-local fd00:: (fc00::/7 范围)'],
      ['http://[fe80::1234:5678:9abc:def0]/', 'IPv6 link-local 完整'],
      ['http://[::ffff:127.0.0.1]/', 'IPv4-mapped IPv6 loopback'],
      ['http://[::ffff:10.0.0.1]/', 'IPv4-mapped IPv6 private'],
    ])('应拒绝 %s (%s)', (url) => {
      expect(() => policy.validateUrl(url)).toThrow(ExternalResourceError)
      try {
        policy.validateUrl(url)
      } catch (err) {
        const code = (err as ExternalResourceError).code
        expect([ExternalResourceErrorCode.PRIVATE_ADDRESS]).toContain(code)
      }
    })

    it('isPrivateAddress 应正确识别 IPv6 私网', () => {
      expect(policy.isPrivateAddress('::1')).toBe(true)
      expect(policy.isPrivateAddress('::')).toBe(true)
      expect(policy.isPrivateAddress('fe80::1')).toBe(true)
      expect(policy.isPrivateAddress('fc00::1')).toBe(true)
      expect(policy.isPrivateAddress('fd00::1')).toBe(true)
      expect(policy.isPrivateAddress('fe80::1234:5678:9abc:def0')).toBe(true)
    })

    it('isPrivateAddress 应放行公网 IPv6', () => {
      expect(policy.isPrivateAddress('2001:4860:4860::8888')).toBe(false) // Google DNS
      expect(policy.isPrivateAddress('2606:4700:4700::1111')).toBe(false) // Cloudflare DNS
    })

    it('应拒绝 IPv4-mapped IPv6 私网地址', () => {
      // ::ffff:127.0.0.1 是 IPv4-mapped IPv6 形式的 loopback
      expect(policy.isPrivateAddress('::ffff:127.0.0.1')).toBe(true)
      expect(policy.isPrivateAddress('::ffff:10.0.0.1')).toBe(true)
    })
  })

  // -------------------- 7. 子域名匹配 --------------------
  describe('子域名匹配', () => {
    it('应允许 www.youtube.com（youtube.com 的子域名）', () => {
      expect(() => policy.validateUrl('https://www.youtube.com/watch?v=abc')).not.toThrow()
    })

    it('应允许 m.bilibili.com（bilibili.com 的子域名）', () => {
      expect(() => policy.validateUrl('https://m.bilibili.com/video/abc')).not.toThrow()
    })

    it('应允许任意深度的子域名（如 a.b.c.youtube.com）', () => {
      // youtube.com 在 allowlist 中，其子域名应被允许
      expect(() => policy.validateUrl('https://music.youtube.com/')).not.toThrow()
    })

    it('应拒绝 evil-youtube.com（非子域名，仅后缀相似）', () => {
      expect(() => policy.validateUrl('https://evil-youtube.com/')).toThrow(ExternalResourceError)
      try {
        policy.validateUrl('https://evil-youtube.com/')
      } catch (err) {
        expect((err as ExternalResourceError).code).toBe(ExternalResourceErrorCode.HOST_NOT_ALLOWED)
      }
    })

    it('应拒绝 notyoutube.com', () => {
      expect(() => policy.validateUrl('https://notyoutube.com/')).toThrow(ExternalResourceError)
    })

    it('应拒绝 youtube.com.attacker.com（域名前置攻击）', () => {
      // allowlist 中有 youtube.com，但 youtube.com.attacker.com 不是其子域名
      // 它是 attacker.com 的子域名，以 .youtube.com 结尾但不匹配 .youtube.com
      // 实际上 "youtube.com.attacker.com".endsWith(".youtube.com") 为 false
      expect(() => policy.validateUrl('https://youtube.com.attacker.com/')).toThrow(
        ExternalResourceError,
      )
    })

    it('应拒绝 youtube.comevil.com', () => {
      expect(() => policy.validateUrl('https://youtube.comevil.com/')).toThrow(
        ExternalResourceError,
      )
    })
  })

  // -------------------- 额外安全检查 --------------------
  describe('额外安全检查', () => {
    it('应拒绝空 URL', () => {
      expect(() => policy.validateUrl('')).toThrow(ExternalResourceError)
      try {
        policy.validateUrl('')
      } catch (err) {
        expect((err as ExternalResourceError).code).toBe(ExternalResourceErrorCode.INVALID_URL)
      }
    })

    it('应拒绝非字符串 URL', () => {
      expect(() => policy.validateUrl(null as unknown as string)).toThrow(ExternalResourceError)
      expect(() => policy.validateUrl(undefined as unknown as string)).toThrow(
        ExternalResourceError,
      )
    })

    it('应拒绝格式不合法的 URL', () => {
      expect(() => policy.validateUrl('not-a-url')).toThrow(ExternalResourceError)
      expect(() => policy.validateUrl('://missing-scheme')).toThrow(ExternalResourceError)
      expect(() => policy.validateUrl('https://')).toThrow(ExternalResourceError)
    })

    it('应拒绝携带 credentials 的 URL', () => {
      // 防止 http://user:pass@host 或 http://youtube.com@evil.com 攻击
      expect(() => policy.validateUrl('https://user:pass@www.youtube.com/')).toThrow(
        ExternalResourceError,
      )
      try {
        policy.validateUrl('https://user:pass@www.youtube.com/')
      } catch (err) {
        expect((err as ExternalResourceError).code).toBe(ExternalResourceErrorCode.INVALID_URL)
      }
    })

    it('应拒绝 youtube.com@evil.com 形式的 URL 注入', () => {
      // URL 解析后 hostname 为 evil.com，username 为 youtube.com
      expect(() => policy.validateUrl('https://youtube.com@evil.com/')).toThrow(
        ExternalResourceError,
      )
    })
  })

  // -------------------- 配置选项 --------------------
  describe('配置选项', () => {
    it('应使用自定义 allowlist', () => {
      const customPolicy = new ExternalResourcePolicyService({
        allowedHosts: ['custom.com', 'www.custom.com'],
      })
      expect(() => customPolicy.validateUrl('https://custom.com/page')).not.toThrow()
      expect(() => customPolicy.validateUrl('https://www.custom.com/page')).not.toThrow()
      // 默认 allowlist 中的域名不应通过自定义 allowlist
      expect(() => customPolicy.validateUrl('https://www.youtube.com/')).toThrow(
        ExternalResourceError,
      )
    })

    it('应使用自定义 maxRedirectDepth', () => {
      const customPolicy = new ExternalResourcePolicyService({ maxRedirectDepth: 2 })
      expect(() =>
        customPolicy.validateRedirect('https://www.youtube.com/', 'https://www.youtube.com/r', 2),
      ).not.toThrow()
      expect(() =>
        customPolicy.validateRedirect('https://www.youtube.com/', 'https://www.youtube.com/r', 3),
      ).toThrow(ExternalResourceError)
    })

    it('应暴露默认配置值', () => {
      expect(policy.maxRedirectDepth).toBe(5)
      expect(policy.maxResponseBytes).toBe(500 * 1024 * 1024)
      expect(policy.maxResponseMs).toBe(60_000)
    })

    it('getAllowedHosts 应返回列表副本', () => {
      const hosts = policy.getAllowedHosts()
      expect(hosts).toContain('youtube.com')
      expect(hosts).toContain('bilibili.com')
      // 修改返回值不应影响内部状态
      hosts.push('evil.com')
      expect(policy.getAllowedHosts()).not.toContain('evil.com')
    })
  })
})
