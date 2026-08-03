import {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  resetEncryptionKeyCache,
} from './secret-encryption'

describe('secret-encryption', () => {
  const TEST_KEY = 'a'.repeat(64) // 32 bytes hex

  beforeEach(() => {
    resetEncryptionKeyCache()
  })

  afterEach(() => {
    delete process.env.SECRET_ENCRYPTION_KEY
    resetEncryptionKeyCache()
  })

  describe('未配置密钥时', () => {
    it('encryptSecret 应透传原值', () => {
      const result = encryptSecret('my-api-key')
      expect(result).toBe('my-api-key')
    })

    it('decryptSecret 应透传原值', () => {
      const result = decryptSecret('my-api-key')
      expect(result).toBe('my-api-key')
    })

    it('isEncrypted 应返回 false', () => {
      expect(isEncrypted('my-api-key')).toBe(false)
    })
  })

  describe('配置密钥后', () => {
    beforeEach(() => {
      process.env.SECRET_ENCRYPTION_KEY = TEST_KEY
    })

    it('encryptSecret 应返回加密值（带 enc:v1: 前缀）', () => {
      const result = encryptSecret('my-api-key')
      expect(result).toMatch(/^enc:v1:/)
      expect(result).not.toBe('my-api-key')
    })

    it('decryptSecret 应解密回原值', () => {
      const encrypted = encryptSecret('my-api-key')
      const decrypted = decryptSecret(encrypted)
      expect(decrypted).toBe('my-api-key')
    })

    it('isEncrypted 应正确识别加密值', () => {
      const encrypted = encryptSecret('my-api-key')
      expect(isEncrypted(encrypted)).toBe(true)
      expect(isEncrypted('plain-value')).toBe(false)
    })

    it('encryptSecret 不应重复加密已加密的值', () => {
      const first = encryptSecret('my-api-key')
      const second = encryptSecret(first)
      expect(first).toBe(second)
    })

    it('decryptSecret 应透传未加密的旧值（向后兼容）', () => {
      const result = decryptSecret('old-plaintext-key')
      expect(result).toBe('old-plaintext-key')
    })

    it('应能处理空字符串', () => {
      const encrypted = encryptSecret('')
      const decrypted = decryptSecret(encrypted)
      expect(decrypted).toBe('')
    })

    it('应能处理长 API Key（含特殊字符）', () => {
      const longKey = 'sk-proj-' + 'x'.repeat(200) + '!@#$%^&*()_+{}|:<>?'
      const encrypted = encryptSecret(longKey)
      const decrypted = decryptSecret(encrypted)
      expect(decrypted).toBe(longKey)
    })

    it('应能处理逗号分隔的多 Key', () => {
      const multiKey = 'key1,key2,key3'
      const encrypted = encryptSecret(multiKey)
      const decrypted = decryptSecret(encrypted)
      expect(decrypted).toBe(multiKey)
    })
  })

  describe('密钥长度校验', () => {
    it('应拒绝非 64 字符的密钥', () => {
      process.env.SECRET_ENCRYPTION_KEY = 'too-short'
      expect(() => encryptSecret('test')).toThrow('SECRET_ENCRYPTION_KEY must be 64 hex characters')
    })
  })

  describe('解密失败时', () => {
    it('应返回原值（不崩溃）', () => {
      process.env.SECRET_ENCRYPTION_KEY = TEST_KEY
      const badValue = 'enc:v1:' + Buffer.from('not-a-real-payload').toString('base64')
      const result = decryptSecret(badValue)
      expect(result).toBe(badValue)
    })

    it('有前缀但无密钥时应返回原值', () => {
      delete process.env.SECRET_ENCRYPTION_KEY
      resetEncryptionKeyCache()
      const result = decryptSecret('enc:v1:somedata')
      expect(result).toBe('enc:v1:somedata')
    })
  })
})
