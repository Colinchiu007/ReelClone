import { useEffect, useState, useCallback } from 'react'
import { Card, Tabs, Table, Button, Space, Modal, Input, message, Empty, Spin } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CheckOutlined, CloseOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  getPendingReviews,
  reviewTemplate,
  reviewAvatarGroup,
  type Template,
  type AvatarGroup,
} from '../api/admin'

type ReviewTab = 'all' | 'template' | 'avatar'

interface ReviewActionState {
  type: 'template' | 'avatar'
  id: string
  approve: boolean
}

export default function Reviews() {
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<ReviewTab>('all')
  const [templates, setTemplates] = useState<Template[]>([])
  const [avatarGroups, setAvatarGroups] = useState<AvatarGroup[]>([])

  const [actionOpen, setActionOpen] = useState(false)
  const [action, setAction] = useState<ReviewActionState | null>(null)
  const [note, setNote] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const fetchData = useCallback(async (t: ReviewTab) => {
    setLoading(true)
    try {
      const result = await getPendingReviews(t)
      setTemplates(result.templates)
      setAvatarGroups(result.avatarGroups)
    } catch {
      // 错误已由拦截器提示
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData(tab)
  }, [tab, fetchData])

  const openAction = (type: 'template' | 'avatar', id: string, approve: boolean) => {
    setAction({ type, id, approve })
    setNote('')
    setActionOpen(true)
  }

  const handleAction = async () => {
    if (!action) return
    setActionLoading(true)
    try {
      if (action.type === 'template') {
        await reviewTemplate(action.id, action.approve ? 'ACTIVE' : 'REJECTED', note || undefined)
      } else {
        await reviewAvatarGroup(
          action.id,
          action.approve ? 'APPROVED' : 'EXPIRED',
          note || undefined,
        )
      }
      message.success(action.approve ? '已通过' : '已拒绝')
      setActionOpen(false)
      void fetchData(tab)
    } catch {
      // 错误已由拦截器提示
    } finally {
      setActionLoading(false)
    }
  }

  const templateColumns: ColumnsType<Template> = [
    { title: '标题', dataIndex: 'title', ellipsis: true },
    {
      title: '提交者',
      dataIndex: 'userId',
      width: 200,
      render: (val: string | null) => val || '-',
    },
    { title: '分类', dataIndex: 'category', width: 120, render: (v: string | null) => v || '-' },
    {
      title: '提交时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_v: unknown, record: Template) => (
        <Space>
          <Button
            size="small"
            type="primary"
            icon={<CheckOutlined />}
            onClick={() => openAction('template', record.id, true)}
          >
            通过
          </Button>
          <Button
            size="small"
            danger
            icon={<CloseOutlined />}
            onClick={() => openAction('template', record.id, false)}
          >
            拒绝
          </Button>
        </Space>
      ),
    },
  ]

  const avatarColumns: ColumnsType<AvatarGroup> = [
    { title: '名称', dataIndex: 'name', ellipsis: true },
    { title: '提交者', dataIndex: 'userId', width: 200 },
    {
      title: '提交时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_v: unknown, record: AvatarGroup) => (
        <Space>
          <Button
            size="small"
            type="primary"
            icon={<CheckOutlined />}
            onClick={() => openAction('avatar', record.id, true)}
          >
            授权
          </Button>
          <Button
            size="small"
            danger
            icon={<CloseOutlined />}
            onClick={() => openAction('avatar', record.id, false)}
          >
            拒绝
          </Button>
        </Space>
      ),
    },
  ]

  const renderAllTab = () => {
    if (loading) {
      return <Spin />
    }
    if (templates.length === 0 && avatarGroups.length === 0) {
      return <Empty description="暂无待审核内容" />
    }
    return (
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {templates.length > 0 && (
          <Card title={`模板审核 (${templates.length})`} size="small">
            <Table
              rowKey="id"
              columns={templateColumns}
              dataSource={templates}
              pagination={false}
              size="small"
            />
          </Card>
        )}
        {avatarGroups.length > 0 && (
          <Card title={`形象组授权 (${avatarGroups.length})`} size="small">
            <Table
              rowKey="id"
              columns={avatarColumns}
              dataSource={avatarGroups}
              pagination={false}
              size="small"
            />
          </Card>
        )}
      </Space>
    )
  }

  const tabItems = [
    {
      key: 'all',
      label: `全部 (${templates.length + avatarGroups.length})`,
      children: renderAllTab(),
    },
    {
      key: 'template',
      label: `模板审核 (${templates.length})`,
      children: (
        <Card>
          <Table
            rowKey="id"
            columns={templateColumns}
            dataSource={templates}
            loading={loading}
            pagination={false}
          />
        </Card>
      ),
    },
    {
      key: 'avatar',
      label: `形象组授权 (${avatarGroups.length})`,
      children: (
        <Card>
          <Table
            rowKey="id"
            columns={avatarColumns}
            dataSource={avatarGroups}
            loading={loading}
            pagination={false}
          />
        </Card>
      ),
    },
  ]

  return (
    <>
      <Tabs activeKey={tab} onChange={(k) => setTab(k as ReviewTab)} items={tabItems} />
      <Modal
        title={action?.approve ? '确认通过' : '确认拒绝'}
        open={actionOpen}
        onOk={handleAction}
        onCancel={() => setActionOpen(false)}
        confirmLoading={actionLoading}
        okText="确认"
      >
        <div style={{ marginBottom: 8 }}>审核备注（可选）：</div>
        <Input.TextArea
          rows={3}
          maxLength={256}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Modal>
    </>
  )
}
