import { useEffect, useState, useCallback } from 'react'
import {
  Card,
  Tabs,
  Table,
  Button,
  Tag,
  Space,
  Modal,
  Input,
  message,
  type TablePaginationConfig,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { StopOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  listWorks,
  listTemplates,
  takedownWork,
  updateTemplateStatus,
  type Work,
  type Template,
  type WorkStatus,
  type TemplateStatus,
} from '../api/admin'

const workStatusColor: Record<WorkStatus, string> = {
  PENDING: 'orange',
  PROCESSING: 'blue',
  COMPLETED: 'green',
  FAILED: 'red',
  CANCELLED: 'default',
  REJECTED: 'volcano',
  DELETED: 'default',
}

const templateStatusColor: Record<TemplateStatus, string> = {
  ACTIVE: 'green',
  OFFLINE: 'default',
  PENDING_REVIEW: 'orange',
  REJECTED: 'red',
  ANALYZING: 'blue',
  ANALYSIS_FAILED: 'magenta',
}

export default function Content() {
  const [tab, setTab] = useState<'works' | 'templates'>('works')

  // 作品状态
  const [worksLoading, setWorksLoading] = useState(false)
  const [works, setWorks] = useState<Work[]>([])
  const [worksTotal, setWorksTotal] = useState(0)
  const [worksPage, setWorksPage] = useState(1)
  const [worksPageSize, setWorksPageSize] = useState(20)

  // 模板状态
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])

  // 下架 Modal
  const [takedownOpen, setTakedownOpen] = useState(false)
  const [takedownTarget, setTakedownTarget] = useState<Work | null>(null)
  const [takedownReason, setTakedownReason] = useState('')
  const [takedownLoading, setTakedownLoading] = useState(false)

  const fetchWorks = useCallback(async () => {
    setWorksLoading(true)
    try {
      const result = await listWorks({ page: worksPage, pageSize: worksPageSize })
      setWorks(result.list)
      setWorksTotal(result.total)
    } catch {
      // 错误已由拦截器提示
    } finally {
      setWorksLoading(false)
    }
  }, [worksPage, worksPageSize])

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true)
    try {
      const result = await listTemplates()
      setTemplates(result)
    } catch {
      // 错误已由拦截器提示
    } finally {
      setTemplatesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'works') {
      void fetchWorks()
    } else {
      void fetchTemplates()
    }
  }, [tab, fetchWorks, fetchTemplates])

  const openTakedown = (record: Work) => {
    setTakedownTarget(record)
    setTakedownReason('')
    setTakedownOpen(true)
  }

  const handleTakedown = async () => {
    if (!takedownTarget) return
    if (!takedownReason.trim()) {
      message.warning('请填写下架原因')
      return
    }
    setTakedownLoading(true)
    try {
      await takedownWork(takedownTarget.id, takedownReason)
      message.success('已下架')
      setTakedownOpen(false)
      void fetchWorks()
    } catch {
      // 错误已由拦截器提示
    } finally {
      setTakedownLoading(false)
    }
  }

  const handleTemplateStatus = async (record: Template, next: 'ACTIVE' | 'OFFLINE') => {
    try {
      await updateTemplateStatus(record.id, next)
      message.success(next === 'ACTIVE' ? '已上架' : '已下架')
      void fetchTemplates()
    } catch {
      // 错误已由拦截器提示
    }
  }

  const workColumns: ColumnsType<Work> = [
    { title: '标题', dataIndex: 'title', ellipsis: true },
    { title: '类型', dataIndex: 'type', width: 100 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (v: WorkStatus) => <Tag color={workStatusColor[v]}>{v}</Tag>,
    },
    {
      title: '创作者',
      dataIndex: 'userId',
      width: 200,
      ellipsis: true,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_v: unknown, record: Work) => (
        <Button
          size="small"
          danger
          icon={<StopOutlined />}
          onClick={() => openTakedown(record)}
          disabled={record.status === 'CANCELLED' || record.status === 'DELETED'}
        >
          强制下架
        </Button>
      ),
    },
  ]

  const templateColumns: ColumnsType<Template> = [
    { title: '标题', dataIndex: 'title', ellipsis: true },
    { title: '分类', dataIndex: 'category', width: 120, render: (v: string | null) => v || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      width: 130,
      render: (v: TemplateStatus) => <Tag color={templateStatusColor[v]}>{v}</Tag>,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_v: unknown, record: Template) =>
        record.status === 'ACTIVE' ? (
          <Button
            size="small"
            icon={<ArrowDownOutlined />}
            onClick={() => handleTemplateStatus(record, 'OFFLINE')}
          >
            下架
          </Button>
        ) : (
          <Button
            size="small"
            type="primary"
            icon={<ArrowUpOutlined />}
            onClick={() => handleTemplateStatus(record, 'ACTIVE')}
          >
            上架
          </Button>
        ),
    },
  ]

  const worksPagination: TablePaginationConfig = {
    current: worksPage,
    pageSize: worksPageSize,
    total: worksTotal,
    showSizeChanger: true,
    showTotal: (t) => `共 ${t} 条`,
    onChange: (p, ps) => {
      setWorksPage(p)
      setWorksPageSize(ps)
    },
  }

  const tabItems = [
    {
      key: 'works',
      label: '作品管理',
      children: (
        <Card>
          <Table
            rowKey="id"
            columns={workColumns}
            dataSource={works}
            loading={worksLoading}
            pagination={worksPagination}
            scroll={{ x: 900 }}
          />
        </Card>
      ),
    },
    {
      key: 'templates',
      label: '模板管理',
      children: (
        <Card>
          <Table
            rowKey="id"
            columns={templateColumns}
            dataSource={templates}
            loading={templatesLoading}
            pagination={false}
            scroll={{ x: 800 }}
          />
        </Card>
      ),
    },
  ]

  return (
    <>
      <Tabs activeKey={tab} onChange={(k) => setTab(k as 'works' | 'templates')} items={tabItems} />
      <Modal
        title="强制下架作品"
        open={takedownOpen}
        onOk={handleTakedown}
        onCancel={() => setTakedownOpen(false)}
        confirmLoading={takedownLoading}
        okText="确认下架"
        okButtonProps={{ danger: true }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <span>作品：{takedownTarget?.title}</span>
          <Input.TextArea
            rows={3}
            maxLength={256}
            placeholder="请填写下架原因（将通知创作者）"
            value={takedownReason}
            onChange={(e) => setTakedownReason(e.target.value)}
          />
        </Space>
      </Modal>
    </>
  )
}
