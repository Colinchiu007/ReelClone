import { useState } from 'react'
import { Card, Tabs, Form, Input, Button, message, Radio } from 'antd'
import { NotificationOutlined, SendOutlined } from '@ant-design/icons'
import {
  broadcastNotification,
  sendNotification,
  type BroadcastPayload,
  type SendNotificationPayload,
} from '../api/admin'

interface BroadcastFormValues {
  title: string
  content: string
  range: 'all' | 'active'
}

interface SendFormValues {
  userId: string
  title: string
  content: string
}

export default function Notifications() {
  const [tab, setTab] = useState<'broadcast' | 'send'>('broadcast')
  const [broadcastLoading, setBroadcastLoading] = useState(false)
  const [sendLoading, setSendLoading] = useState(false)
  const [broadcastForm] = Form.useForm<BroadcastFormValues>()
  const [sendForm] = Form.useForm<SendFormValues>()

  const handleBroadcast = async () => {
    const values = await broadcastForm.validateFields()
    setBroadcastLoading(true)
    try {
      const payload: BroadcastPayload = {
        title: values.title,
        content: values.content,
        range: values.range,
      }
      await broadcastNotification(payload)
      message.success('广播已发送')
      broadcastForm.resetFields()
    } catch {
      // 错误已由拦截器提示
    } finally {
      setBroadcastLoading(false)
    }
  }

  const handleSend = async () => {
    const values = await sendForm.validateFields()
    setSendLoading(true)
    try {
      const payload: SendNotificationPayload = {
        userId: values.userId,
        title: values.title,
        content: values.content,
      }
      await sendNotification(payload)
      message.success('推送已发送')
      sendForm.resetFields()
    } catch {
      // 错误已由拦截器提示
    } finally {
      setSendLoading(false)
    }
  }

  const tabItems = [
    {
      key: 'broadcast',
      label: (
        <span>
          <NotificationOutlined /> 广播公告
        </span>
      ),
      children: (
        <Card title="广播公告" style={{ maxWidth: 600 }}>
          <Form<BroadcastFormValues>
            form={broadcastForm}
            layout="vertical"
            initialValues={{ range: 'all' }}
          >
            <Form.Item
              name="title"
              label="标题"
              rules={[{ required: true, message: '请输入标题' }]}
            >
              <Input maxLength={64} placeholder="公告标题" />
            </Form.Item>
            <Form.Item
              name="content"
              label="内容"
              rules={[{ required: true, message: '请输入内容' }]}
            >
              <Input.TextArea rows={5} maxLength={500} placeholder="公告内容" />
            </Form.Item>
            <Form.Item name="range" label="推送范围">
              <Radio.Group>
                <Radio value="all">全部用户</Radio>
                <Radio value="active">活跃用户（近 7 天）</Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item>
              <Button type="primary" loading={broadcastLoading} onClick={handleBroadcast}>
                发送广播
              </Button>
            </Form.Item>
          </Form>
        </Card>
      ),
    },
    {
      key: 'send',
      label: (
        <span>
          <SendOutlined /> 定向推送
        </span>
      ),
      children: (
        <Card title="定向推送" style={{ maxWidth: 600 }}>
          <Form<SendFormValues> form={sendForm} layout="vertical">
            <Form.Item
              name="userId"
              label="用户 ID"
              rules={[{ required: true, message: '请输入用户 ID' }]}
            >
              <Input placeholder="目标用户 UUID" />
            </Form.Item>
            <Form.Item
              name="title"
              label="标题"
              rules={[{ required: true, message: '请输入标题' }]}
            >
              <Input maxLength={64} placeholder="通知标题" />
            </Form.Item>
            <Form.Item
              name="content"
              label="内容"
              rules={[{ required: true, message: '请输入内容' }]}
            >
              <Input.TextArea rows={5} maxLength={500} placeholder="通知内容" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" loading={sendLoading} onClick={handleSend}>
                发送推送
              </Button>
            </Form.Item>
          </Form>
        </Card>
      ),
    },
  ]

  return (
    <Tabs activeKey={tab} onChange={(k) => setTab(k as 'broadcast' | 'send')} items={tabItems} />
  )
}
