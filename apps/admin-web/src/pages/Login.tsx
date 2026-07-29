import { useState } from 'react'
import { Card, Form, Input, Button, Typography, message } from 'antd'
import { LockOutlined, MobileOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { adminLogin } from '../api/admin'
import { setAuth } from '../stores/auth'

const { Title, Text } = Typography

interface LoginFormValues {
  mobile: string
  password: string
}

export default function Login() {
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const onFinish = async (values: LoginFormValues) => {
    setLoading(true)
    try {
      const result = await adminLogin(values.mobile, values.password)
      setAuth(result.accessToken, result.user)
      message.success('登录成功')
      navigate('/dashboard', { replace: true })
    } catch {
      // 错误信息已由 http 拦截器统一提示
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <Card style={{ width: 400, borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <div className="login-logo">RC</div>
        <Title level={3} style={{ textAlign: 'center', marginBottom: 4 }}>
          ReelClone
        </Title>
        <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 24 }}>
          运营管理后台
        </Text>
        <Form<LoginFormValues> layout="vertical" onFinish={onFinish} autoComplete="off">
          <Form.Item
            name="mobile"
            label="手机号"
            rules={[
              { required: true, message: '请输入手机号' },
              { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' },
            ]}
          >
            <Input prefix={<MobileOutlined />} placeholder="管理员手机号" size="large" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少 6 位' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" size="large" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={loading}
              style={{
                background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                border: 'none',
              }}
            >
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
