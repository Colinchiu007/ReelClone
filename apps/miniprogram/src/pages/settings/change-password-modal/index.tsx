/**
 * 修改密码弹窗组件
 * 对应 FR6_设置_04_修改密码弹窗
 *
 * - 作为组件被 settings/index.tsx 引入
 * - 两种模式：
 *   已设置密码：旧密码 + 新密码 + 确认新密码
 *   未设置密码：手机号 + 验证码 + 新密码
 * - 调用 user.api.changePassword({ oldPassword, newPassword }) 或 changePassword({ code, newPassword })
 * - 密码要求：≥6 位
 * - 验证：两次新密码一致
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Input } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { sendSms, changePassword } from '@/services/api/user.api';
import './index.scss';

export interface ChangePasswordModalProps {
  visible: boolean;
  /** 是否已设置密码（决定显示模式） */
  hasPassword: boolean;
  /** 未设置密码模式下使用的手机号 */
  mobile?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

/** 验证码倒计时秒数 */
const COUNTDOWN_SECONDS = 60;

/** 手机号校验正则 */
const MOBILE_REGEX = /^1[3-9]\d{9}$/;

/** 密码最小长度 */
const MIN_PWD_LENGTH = 6;

export default function ChangePasswordModal({
  visible,
  hasPassword,
  mobile,
  onClose,
  onSuccess,
}: ChangePasswordModalProps) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [smsMobile, setSmsMobile] = useState(mobile || '');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 清理倒计时定时器 */
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** 启动倒计时 */
  const startCountdown = useCallback(() => {
    setCountdown(COUNTDOWN_SECONDS);
    clearTimer();
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearTimer]);

  /** 弹窗关闭时清理状态 */
  useEffect(() => {
    if (!visible) {
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setCode('');
      setCountdown(0);
      clearTimer();
    }
  }, [visible, clearTimer]);

  /** mobile prop 变化时同步 */
  useEffect(() => {
    if (mobile) setSmsMobile(mobile);
  }, [mobile]);

  /** 组件卸载时清理定时器 */
  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  /** 阻止冒泡 */
  const handleStopPropagation = useCallback((e: { stopPropagation?: () => void }) => {
    e.stopPropagation?.();
  }, []);

  /** 获取验证码（未设置密码模式） */
  const handleSendCode = useCallback(async () => {
    if (countdown > 0 || sendingCode) return;
    if (!MOBILE_REGEX.test(smsMobile)) {
      Taro.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }
    setSendingCode(true);
    try {
      await sendSms(smsMobile, 'RESET_PASSWORD');
      Taro.showToast({ title: '验证码已发送', icon: 'success' });
      startCountdown();
    } catch (e) {
      // 错误提示由 request 层处理
    } finally {
      setSendingCode(false);
    }
  }, [countdown, sendingCode, smsMobile, startCountdown]);

  /** 校验新密码长度 */
  const validateNewPassword = useCallback((pwd: string): string => {
    if (!pwd) return '请输入新密码';
    if (pwd.length < MIN_PWD_LENGTH) return `密码至少 ${MIN_PWD_LENGTH} 位`;
    return '';
  }, []);

  /** 提交修改密码 */
  const handleSubmit = useCallback(async () => {
    if (submitting) return;

    // 校验新密码
    const newPwdError = validateNewPassword(newPassword);
    if (newPwdError) {
      Taro.showToast({ title: newPwdError, icon: 'none' });
      return;
    }
    // 校验两次密码一致
    if (newPassword !== confirmPassword) {
      Taro.showToast({ title: '两次输入的新密码不一致', icon: 'none' });
      return;
    }

    setSubmitting(true);
    try {
      if (hasPassword) {
        // 已设置密码模式：用旧密码验证
        if (!oldPassword) {
          Taro.showToast({ title: '请输入旧密码', icon: 'none' });
          setSubmitting(false);
          return;
        }
        await changePassword({ oldPassword, newPassword });
      } else {
        // 未设置密码模式：用验证码验证
        if (!MOBILE_REGEX.test(smsMobile)) {
          Taro.showToast({ title: '请输入正确的手机号', icon: 'none' });
          setSubmitting(false);
          return;
        }
        if (code.length !== 6) {
          Taro.showToast({ title: '请输入 6 位验证码', icon: 'none' });
          setSubmitting(false);
          return;
        }
        await changePassword({ code, newPassword });
      }
      Taro.showToast({ title: '密码修改成功', icon: 'success' });
      onSuccess?.();
    } catch (e) {
      // 错误提示由 request 层处理
    } finally {
      setSubmitting(false);
    }
  }, [
    submitting,
    hasPassword,
    oldPassword,
    newPassword,
    confirmPassword,
    smsMobile,
    code,
    validateNewPassword,
    onSuccess,
  ]);

  if (!visible) return null;

  const canSendCode = MOBILE_REGEX.test(smsMobile) && countdown === 0 && !sendingCode;

  return (
    <View className='pwd-modal' onClick={onClose}>
      <View className='pwd-modal__panel' onClick={handleStopPropagation}>
        <View className='pwd-modal__head'>
          <Text className='pwd-modal__title'>修改密码</Text>
          <Text className='pwd-modal__close' onClick={onClose}>×</Text>
        </View>

        <View className='pwd-modal__body'>
          {/* 已设置密码模式：旧密码 */}
          {hasPassword ? (
            <View className='pwd-modal__field'>
              <Text className='pwd-modal__label'>旧密码</Text>
              <Input
                className='pwd-modal__input'
                type='text'
                password
                placeholder='请输入旧密码'
                value={oldPassword}
                onInput={(e) => setOldPassword(e.detail.value)}
              />
            </View>
          ) : (
            <>
              {/* 未设置密码模式：手机号 */}
              <View className='pwd-modal__field'>
                <Text className='pwd-modal__label'>手机号</Text>
                <Input
                  className='pwd-modal__input'
                  type='number'
                  maxlength={11}
                  placeholder='请输入手机号'
                  value={smsMobile}
                  onInput={(e) => setSmsMobile(e.detail.value.replace(/\D/g, '').slice(0, 11))}
                />
              </View>

              {/* 未设置密码模式：验证码 */}
              <View className='pwd-modal__field'>
                <Text className='pwd-modal__label'>验证码</Text>
                <View className='pwd-modal__code-wrap'>
                  <Input
                    className='pwd-modal__input pwd-modal__input--code'
                    type='number'
                    maxlength={6}
                    placeholder='6 位验证码'
                    value={code}
                    onInput={(e) => setCode(e.detail.value.replace(/\D/g, '').slice(0, 6))}
                  />
                  <View
                    className={`pwd-modal__code-btn ${canSendCode ? '' : 'pwd-modal__code-btn--disabled'}`}
                    onClick={handleSendCode}
                  >
                    <Text>
                      {sendingCode
                        ? '发送中...'
                        : countdown > 0
                          ? `${countdown}s`
                          : '获取验证码'}
                    </Text>
                  </View>
                </View>
              </View>
            </>
          )}

          {/* 新密码 */}
          <View className='pwd-modal__field'>
            <Text className='pwd-modal__label'>新密码</Text>
            <Input
              className='pwd-modal__input'
              type='text'
              password
              placeholder={`至少 ${MIN_PWD_LENGTH} 位`}
              value={newPassword}
              onInput={(e) => setNewPassword(e.detail.value)}
            />
          </View>

          {/* 确认新密码 */}
          <View className='pwd-modal__field'>
            <Text className='pwd-modal__label'>确认新密码</Text>
            <Input
              className='pwd-modal__input'
              type='text'
              password
              placeholder='请再次输入新密码'
              value={confirmPassword}
              onInput={(e) => setConfirmPassword(e.detail.value)}
            />
          </View>

          <Text className='pwd-modal__tip'>
            密码至少 {MIN_PWD_LENGTH} 位，建议字母与数字组合
          </Text>
        </View>

        <View className='pwd-modal__footer'>
          <View className='pwd-modal__btn pwd-modal__btn--ghost' onClick={onClose}>
            <Text>取消</Text>
          </View>
          <View
            className={`pwd-modal__btn pwd-modal__btn--primary ${submitting ? 'pwd-modal__btn--disabled' : ''}`}
            onClick={handleSubmit}
          >
            <Text>{submitting ? '提交中...' : '确认修改'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
