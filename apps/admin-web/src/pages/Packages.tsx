import { useEffect, useState, useCallback } from 'react'
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  message,
  Popconfirm,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, EditOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  listPackages,
  createPackage,
  updatePackage,
  updatePackageStatus,
  type Package,
  type PackageType,
  type PackageStatus,
  type CreatePackagePayload,
} from '../api/admin'

interface PackageFormValues {
  name: string
  description?: string
  price: number
  originalPrice?: number
  points?: number
  bonusPoints?: number
  duration?: number
  features?: string
  type: PackageType
  sort?: number
}

const typeLabel: Record<PackageType, string> = {
  SUBSCRIPTION: '订阅',
  ONE_TIME: '一次性',
}

const statusColor: Record<PackageStatus, string> = {
  ACTIVE: 'green',
  OFFLINE: 'default',
}

export default function Packages() {
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<Package[]>([])

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Package | null>(null)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [form] = Form.useForm<PackageFormValues>()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listPackages()
      setList(result)
    } catch {
      // 错误已由拦截器提示
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ type: 'ONE_TIME', sort: 0, points: 0, bonusPoints: 0 })
    setModalOpen(true)
  }

  const openEdit = (record: Package) => {
    setEditing(record)
    form.setFieldsValue({
      name: record.name,
      description: record.description ?? undefined,
      price: record.price,
      originalPrice: record.originalPrice ?? undefined,
      points: record.points,
      bonusPoints: record.bonusPoints,
      duration: record.duration ?? undefined,
      features: record.features?.join('\n') ?? '',
      type: record.type,
      sort: record.sort,
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setSubmitLoading(true)
    try {
      const features = values.features
        ? values.features
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined
      const payload: CreatePackagePayload = {
        name: values.name,
        description: values.description,
        price: values.price,
        originalPrice: values.originalPrice,
        points: values.points,
        bonusPoints: values.bonusPoints,
        duration: values.duration,
        features,
        type: values.type,
        sort: values.sort,
      }
      if (editing) {
        await updatePackage(editing.id, payload)
        message.success('已更新')
      } else {
        await createPackage(payload)
        message.success('已创建（默认下架）')
      }
      setModalOpen(false)
      void fetchData()
    } catch {
      // 错误已由拦截器提示
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleStatusToggle = async (record: Package) => {
    const next: PackageStatus = record.status === 'ACTIVE' ? 'OFFLINE' : 'ACTIVE'
    try {
      await updatePackageStatus(record.id, next)
      message.success(next === 'ACTIVE' ? '已上架' : '已下架')
      void fetchData()
    } catch {
      // 错误已由拦截器提示
    }
  }

  const columns: ColumnsType<Package> = [
    { title: '名称', dataIndex: 'name', ellipsis: true },
    {
      title: '类型',
      dataIndex: 'type',
      width: 100,
      render: (v: PackageType) => typeLabel[v],
    },
    {
      title: '价格',
      dataIndex: 'price',
      width: 100,
      render: (v: number) => `¥${v.toFixed(2)}`,
    },
    {
      title: '积分',
      width: 140,
      render: (_v: unknown, record: Package) =>
        `${record.points}${record.bonusPoints ? ` +${record.bonusPoints}` : ''}`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: PackageStatus) => (
        <Tag color={statusColor[v]}>{v === 'ACTIVE' ? '上架' : '下架'}</Tag>
      ),
    },
    {
      title: '排序',
      dataIndex: 'sort',
      width: 80,
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 170,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_v: unknown, record: Package) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title={record.status === 'ACTIVE' ? '确认下架？' : '确认上架？'}
            onConfirm={() => handleStatusToggle(record)}
          >
            <Button
              size="small"
              type={record.status === 'ACTIVE' ? 'default' : 'primary'}
              icon={record.status === 'ACTIVE' ? <ArrowDownOutlined /> : <ArrowUpOutlined />}
            >
              {record.status === 'ACTIVE' ? '下架' : '上架'}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <Card>
        <Space style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建套餐
          </Button>
        </Space>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={list}
          loading={loading}
          scroll={{ x: 1000 }}
        />
      </Card>

      <Modal
        title={editing ? '编辑套餐' : '新建套餐'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitLoading}
        okText="保存"
        width={560}
      >
        <Form<PackageFormValues> form={form} layout="vertical">
          <Form.Item
            name="name"
            label="套餐名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space style={{ display: 'flex' }} size="middle">
            <Form.Item
              name="price"
              label="价格（元）"
              rules={[{ required: true, message: '请输入价格' }]}
            >
              <InputNumber min={0} precision={2} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="originalPrice" label="原价（元）">
              <InputNumber min={0} precision={2} style={{ width: 160 }} />
            </Form.Item>
          </Space>
          <Space style={{ display: 'flex' }} size="middle">
            <Form.Item name="points" label="积分数量">
              <InputNumber min={0} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="bonusPoints" label="赠送积分">
              <InputNumber min={0} style={{ width: 160 }} />
            </Form.Item>
          </Space>
          <Space style={{ display: 'flex' }} size="middle">
            <Form.Item name="duration" label="有效期（天）">
              <InputNumber min={0} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="sort" label="排序值">
              <InputNumber min={0} style={{ width: 160 }} />
            </Form.Item>
          </Space>
          <Form.Item
            name="type"
            label="套餐类型"
            rules={[{ required: true, message: '请选择类型' }]}
          >
            <Select
              options={[
                { label: '一次性', value: 'ONE_TIME' },
                { label: '订阅', value: 'SUBSCRIPTION' },
              ]}
              style={{ width: 160 }}
            />
          </Form.Item>
          <Form.Item name="features" label="功能特性（每行一条）">
            <Input.TextArea rows={3} placeholder="每行一条特性" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
