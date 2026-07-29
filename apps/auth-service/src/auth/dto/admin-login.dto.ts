import { IsMobilePhone, IsString, MinLength } from 'class-validator'

/** 管理员登录 DTO */
export class AdminLoginDto {
  /** 手机号（作为管理员账号） */
  @IsMobilePhone('zh-CN')
  mobile: string

  /** 密码 */
  @IsString()
  @MinLength(6)
  password: string
}
