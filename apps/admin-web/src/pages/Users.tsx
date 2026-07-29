import { useEffect, useState, useCallback } from 'react'
import {
  Card,
  Table,
  Input,
  Select,
  Space,
  Button,
  Tag,
  Drawer,
  Descriptions,
  Modal,
  Form,
  InputNumber,
  message,
  Popconfirm,
  type TablePaginationConfig,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  EyeOutlined,
  LockOutlined,
  UnlockOutlined,
  GiftOutlined,
  CrownOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  listUsers,
  getUserDetail,
  updateUserStatus,
  updateUserRole,
  grantPoints,
  type User,
  type UserRole,
  type UserStatus,
} from '../api/admin'

const roleColor: Record<UserRole, string> = {
  USER: 'blue',
  ADMIN: 'gold',
  SUPER_ADMIN: 'red',
}

const statusColor: Record<UserStatus, string> = {
  ACTIVE: 'green',
  FROZEN: 'red',
  DELETED: 'default',
}

const roleOptions = [
  { label: '全部角色', value: '' },
  { label: '普通用户', value: 'USER' },
  { label: '管理员', value: 'ADMIN' },
  { label: '超级管理员', value: 'SUPER_ADMIN' },
]

const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '正常', value: 'ACTIVE' },
  { label: '已封禁', value: 'FROZEN' },
  { label: '已删除', value: 'DELETED' },
]

const roleChangeOptions = [
  { label: '普通用户', value: 'USER' },
  { label: '管理员', value: 'ADMIN' },
  { label: '超级管理员', value: 'SUPER_ADMIN' },
]

interface GrantFormValues {
  amount: number
  reason: string
}

export default function Users() {
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [roleFilter, setRoleFilter] = useState<string>('')

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailUser, setDetailUser] = useState<User | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [grantOpen, setGrantOpen] = useState(false)
  const [grantUser, setGrantUser] = useState<User | null>(null)
  const [grantLoading, setGrantLoading] = useState(false)
  const [grantForm] = Form.useForm<GrantFormValues>()

  const [roleOpen, setRoleOpen] = useState(false)
  const [roleUser, setRoleUser] = useState<User | null>(null)
  const [roleLoading, setRoleLoading] = useState(false)
  const [targetRole, setTargetRole] = useState<UserRole>('USER')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listUsers({
        page,
        pageSize,
        keyword: keyword || undefined,
        status: (statusFilter || undefined) as UserStatus | undefined,
        role: (roleFilter || undefined) as UserRole | undefined,
      })
      setList(result.list)
      setTotal(result.total)
    } catch {
      // 错误已由拦截器提示
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword, statusFilter, roleFilter])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handleSearch = () => {
    setPage(1)
    void fetchData()
  }

  const openDetail = async (record: User) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailUser(record)
    try {
      const detail = await getUserDetail(record.id)
      setDetailUser(detail)
    } catch {
      // 保留已有数据
    } finally {
      setDetailLoading(false)
    }
  }

  const handleToggleStatus = async (record: User) => {
    const next: UserStatus = record.status === 'ACTIVE' ? 'FROZEN' : 'ACTIVE'
    try {
      await updateUserStatus(record.id, next)
      message.success(next === 'FROZEN' ? '已封禁' : '已解封')
      void fetchData()
    } catch {
      // 错误已由拦截器提示
    }
  }

  const openGrant = (record: User) => {
    setGrantUser(record)
    setGrantOpen(true)
    grantForm.resetFields()
  }

  const handleGrant = async () => {
    const values = await grantForm.validateFields()
    if (!grantUser) return
    setGrantLoading(true)
    try {
      await grantPoints(grantUser.id, values.amount, values.reason)
      message.success('调账成功')
      setGrantOpen(false)
      void fetchData()
    } catch {
      // 错误已由拦截器提示
    } finally {
      setGrantLoading(false)
    }
  }

  const openRole = (record: User) => {
    setRoleUser(record)
    setTargetRole(record.role)
    setRoleOpen(true)
  }

  const handleRoleChange = async () => {
    if (!roleUser) return
    setRoleLoading(true)
    try {
      await updateUserRole(roleUser.id, targetRole)
      message.success('角色已更新')
      setRoleOpen(false)
      void fetchData()
    } catch {
      // 错误已由拦截器提示
    } finally {
      setRoleLoading(false)
    }
  }

  const columns: ColumnsType<User> = [
    {
      title: '昵称',
      dataIndex: 'nickname',
      ellipsis: true,
    },
    {
      title: '手机号',
      dataIndex: 'mobile',
      width: 140,
      render: (val: string | null) => val || '-',
    },
    {
      title: '角色',
      dataIndex: 'role',
      width: 110,
      render: (val: UserRole) => <Tag color={roleColor[val]}>{val}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (val: UserStatus) => <Tag color={statusColor[val]}>{val}</Tag>,
    },
    {
      title: '积分',
      dataIndex: 'currentPoints',
      width: 100,
      sorter: true,
    },
    {
      title: '注册时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      render: (_val: unknown, record: User) => (
        <Space size="small">
          <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(record)}>
            详情
          </Button>
          <Popconfirm
            title={record.status === 'ACTIVE' ? '确认封禁该用户？' : '确认解封该用户？'}
            onConfirm={() => handleToggleStatus(record)}
          >
            <Button
              size="small"
              danger={record.status === 'ACTIVE'}
              icon={record.status === 'ACTIVE' ? <LockOutlined /> : <UnlockOutlined />}
            >
              {record.status === 'ACTIVE' ? '封禁' : '解封'}
            </Button>
          </Popconfirm>
          <Button size="small" icon={<GiftOutlined />} onClick={() => openGrant(record)}>
            调账
          </Button>
          <Button size="small" icon={<CrownOutlined />} onClick={() => openRole(record)}>
            角色
          </Button>
        </Space>
      ),
    },
  ]

  const pagination: TablePaginationConfig = {
    current: page,
    pageSize,
    total,
    showSizeChanger: true,
    showTotal: (t) => `共 ${t} 条`,
    onChange: (p, ps) => {
      setPage(p)
      setPageSize(ps)
    },
  }

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="搜索昵称 / 手机号"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 220 }}
            allowClear
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusOptions}
            style={{ width: 130 }}
          />
          <Select
            value={roleFilter}
            onChange={setRoleFilter}
            options={roleOptions}
            style={{ width: 140 }}
          />
          <Button type="primary" onClick={handleSearch}>
            查询
          </Button>
        </Space>
      </Card>

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={list}
          loading={loading}
          pagination={pagination}
          scroll={{ x: 1000 }}
        />
      </Card>

      {/* 用户详情 Drawer */}
      <Drawer
        title="用户详情"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={480}
        loading={detailLoading}
      >
        {detailUser && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="ID">{detailUser.id}</Descriptions.Item>
            <Descriptions.Item label="昵称">{detailUser.nickname}</Descriptions.Item>
            <Descriptions.Item label="手机号">{detailUser.mobile || '-'}</Descriptions.Item>
            <Descriptions.Item label="邮箱">{detailUser.email || '-'}</Descriptions.Item>
            <Descriptions.Item label="角色">
              <Tag color={roleColor[detailUser.role]}>{detailUser.role}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusColor[detailUser.status]}>{detailUser.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="当前积分">{detailUser.currentPoints}</Descriptions.Item>
            <Descriptions.Item label="累计积分">{detailUser.totalPoints}</Descriptions.Item>
            <Descriptions.Item label="最后登录">
              {detailUser.lastLoginAt
                ? dayjs(detailUser.lastLoginAt).format('YYYY-MM-DD HH:mm')
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="注册时间">
              {dayjs(detailUser.createdAt).format('YYYY-MM-DD HH:mm')}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>

      {/* 调账 Modal */}
      <Modal
        title={`调账 - ${grantUser?.nickname ?? ''}`}
        open={grantOpen}
        onOk={handleGrant}
        onCancel={() => setGrantOpen(false)}
        confirmLoading={grantLoading}
        okText="确认调账"
      >
        <Form<GrantFormValues> form={grantForm} layout="vertical">
          <Form.Item
            name="amount"
            label="积分数量"
            rules={[{ required: true, message: '请输入积分数量' }]}
          >
            <InputNumber min={1} max={100000} style={{ width: '100%' }} placeholder="正整数" />
          </Form.Item>
          <Form.Item
            name="reason"
            label="调账原因"
            rules={[{ required: true, message: '请输入调账原因' }]}
          >
            <Input.TextArea rows={3} maxLength={256} placeholder="用于操作日志" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 角色变更 Modal */}
      <Modal
        title={`角色变更 - ${roleUser?.nickname ?? ''}`}
        open={roleOpen}
        onOk={handleRoleChange}
        onCancel={() => setRoleOpen(false)}
        confirmLoading={roleLoading}
        okText="确认变更"
      >
        <div style={{ marginBottom: 8 }}>选择目标角色：</div>
        <Select
          value={targetRole}
          onChange={(v) => setTargetRole(v as UserRole)}
          options={roleChangeOptions}
          style={{ width: '100%' }}
        />
      </Modal>
    </>
  )
}
