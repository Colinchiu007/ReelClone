import { Test } from '@nestjs/testing'
import { JwtService } from '@nestjs/jwt'
import { ServiceJwtModule } from './service-jwt.module'
import { ServiceConfigModule } from './service-config.module'

describe('ServiceJwtModule', () => {
  it('forRoot() 应返回 DynamicModule', () => {
    const mod = ServiceJwtModule.forRoot()
    expect(mod).toBeDefined()
    expect(mod.module).toBe(ServiceJwtModule)
    expect(mod.global).toBe(true)
    expect(mod.imports).toBeDefined()
  })

  it('forRoot() 默认 global=true', () => {
    const mod = ServiceJwtModule.forRoot()
    expect(mod.global).toBe(true)
  })

  it('forRoot({ isGlobal: false }) 应设置 global=false', () => {
    const mod = ServiceJwtModule.forRoot({ isGlobal: false })
    expect(mod.global).toBe(false)
  })

  it('应提供 JwtService', async () => {
    const mod = await Test.createTestingModule({
      imports: [ServiceConfigModule.forRoot(), ServiceJwtModule.forRoot()],
    }).compile()

    const jwtService = mod.get(JwtService)
    expect(jwtService).toBeDefined()
  })

  it('JwtService 应能签发和验证 token', async () => {
    const mod = await Test.createTestingModule({
      imports: [ServiceConfigModule.forRoot(), ServiceJwtModule.forRoot()],
    }).compile()

    const jwtService = mod.get(JwtService)
    const payload = { sub: 'user-1', email: 'test@example.com' }
    const token = jwtService.sign(payload)

    expect(token).toBeDefined()
    expect(typeof token).toBe('string')

    const decoded = jwtService.verify(token)
    expect(decoded.sub).toBe('user-1')
    expect(decoded.email).toBe('test@example.com')
  })
})
