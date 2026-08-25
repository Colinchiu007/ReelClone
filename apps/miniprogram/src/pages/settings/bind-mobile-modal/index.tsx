/**
 * 绑定手机号弹窗组件
 * 对应 FR6_设置_03_绑定手机号弹窗
 *
 * - 作为组件被 settings/index.tsx 引入
 * - 表单：手机号（11 位校验）+ 验证码（6 位）+ 获取验证码按钮（60s 倒计时）
 * - 调用 user.api.sendSms(mobile, 'BIND_MOBILE') 发送验证码
 * - 调用 user.api.bindMobile(mobile, code) 绑定
 * - 表单验证：手机号格式实时校验 + 验证码 6 位 + 提交校验
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { BaseModal } from '@/components'
import { useAuthStore } from '@/stores/auth.store'
import { sendSms, bindMobile } from '@/services/api/user.api'
import './index.scss'

export interface BindMobileModalProps {
  visible: boolean
  onClose: () => void
  onSuccess?: () => void
}

/** 验证码倒计时秒数 */
const COUNTDOWN_SECONDS = 60

/** 手机号校验正则（中国大陆 11 位） */
const MOBILE_REGEX = /^1[3-9]\d{9}$/

export default function BindMobileModal({ visible, onClose, onSuccess }: BindMobileModalProps) {
  const { setUser } = useAuthStore()
  const [mobile, setMobile] = useState('')
  const [code, setCode] = useState('')
  const [mobileError, setMobileError] = useState('')
  const [codeError, setCodeError] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [sendingCode, setSendingCode] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /** 清理倒计时定时器 */
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  /** 倒计时启动 */
  const startCountdown = useCallback(() => {
    setCountdown(COUNTDOWN_SECONDS)
    clearTimer()
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearTimer()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [clearTimer])

  /** 弹窗关闭时清理状态 */
  useEffect(() => {
    if (!visible) {
      setMobile('')
      setCode('')
      setMobileError('')
      setCodeError('')
      setCountdown(0)
      clearTimer()
    }
  }, [visible, clearTimer])

  /** 组件卸载时清理定时器 */
  useEffect(() => {
    return () => clearTimer()
  }, [clearTimer])

  /** 实时校验手机号 */
  const handleMobileChange = useCallback((e: { detail: { value: string } }) => {
    const val = e.detail.value.replace(/\D/g, '').slice(0, 11)
    setMobile(val)
    if (val && !MOBILE_REGEX.test(val)) {
      setMobileError('请输入正确的手机号')
    } else {
      setMobileError('')
    }
  }, [])

  /** 实时校验验证码 */
  const handleCodeChange = useCallback((e: { detail: { value: string } }) => {
    const val = e.detail.value.replace(/\D/g, '').slice(0, 6)
    setCode(val)
    if (val && val.length !== 6) {
      setCodeError('验证码为 6 位数字')
    } else {
      setCodeError('')
    }
  }, [])

  /** 获取验证码 */
  const handleSendCode = useCallback(async () => {
    if (countdown > 0 || sendingCode) return
    if (!MOBILE_REGEX.test(mobile)) {
      setMobileError('请输入正确的手机号')
      Taro.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return
    }
    setSendingCode(true)
    try {
      await sendSms(mobile, 'BIND_MOBILE')
      Taro.showToast({ title: '验证码已发送', icon: 'success' })
      startCountdown()
    } catch (e) {
      // 错误提示由 request 层处理
    } finally {
      setSendingCode(false)
    }
  }, [countdown, sendingCode, mobile, startCountdown])

  /** 提交绑定 */
  const handleSubmit = useCallback(async () => {
    if (submitting) return
    // 提交前再次校验
    let hasError = false
    if (!MOBILE_REGEX.test(mobile)) {
      setMobileError('请输入正确的手机号')
      hasError = true
    }
    if (code.length !== 6) {
      setCodeError('验证码为 6 位数字')
      hasError = true
    }
    if (hasError) {
      Taro.showToast({ title: '请完善表单信息', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      const updated = await bindMobile(mobile, code)
      setUser(updated)
      Taro.showToast({ title: '绑定成功', icon: 'success' })
      onSuccess?.()
    } catch (e) {
      // 错误提示由 request 层处理
    } finally {
      setSubmitting(false)
    }
  }, [submitting, mobile, code, setUser, onSuccess])

  if (!visible) return null

  const canSendCode = MOBILE_REGEX.test(mobile) && countdown === 0 && !sendingCode
  const canSubmit = MOBILE_REGEX.test(mobile) && code.length === 6 && !submitting

  return (
    <BaseModal
      visible={visible}
      variant="center"
      title="绑定手机号"
      busy={submitting}
      onClose={onClose}
      bodyClassName="bind-modal__body"
      footer={
        <>
          <View className="bind-modal__btn bind-modal__btn--ghost" onClick={onClose}>
            <Text>取消</Text>
          </View>
          <View
            className={`bind-modal__btn bind-modal__btn--primary ${canSubmit ? '' : 'bind-modal__btn--disabled'}`}
            onClick={handleSubmit}
          >
            <Text>{submitting ? '绑定中...' : '确认绑定'}</Text>
          </View>
        </>
      }
    >
      {/* 手机号 */}
      <View className="bind-modal__field">
        <Text className="bind-modal__label">手机号</Text>
        <Input
          className="bind-modal__input"
          type="number"
          maxlength={11}
          placeholder="请输入 11 位手机号"
          value={mobile}
          onInput={handleMobileChange}
        />
        {mobileError ? <Text className="bind-modal__error">{mobileError}</Text> : null}
      </View>

      {/* 验证码 */}
      <View className="bind-modal__field">
        <Text className="bind-modal__label">验证码</Text>
        <View className="bind-modal__code-wrap">
          <Input
            className="bind-modal__input bind-modal__input--code"
            type="number"
            maxlength={6}
            placeholder="请输入 6 位验证码"
            value={code}
            onInput={handleCodeChange}
          />
          <View
            className={`bind-modal__code-btn ${canSendCode ? '' : 'bind-modal__code-btn--disabled'}`}
            onClick={handleSendCode}
          >
            <Text>
              {sendingCode ? '发送中...' : countdown > 0 ? `${countdown}s 后重试` : '获取验证码'}
            </Text>
          </View>
        </View>
        {codeError ? <Text className="bind-modal__error">{codeError}</Text> : null}
      </View>
    </BaseModal>
  )
}
