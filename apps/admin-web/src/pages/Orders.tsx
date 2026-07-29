import { useEffect, useState, useCallback } from 'react'
import {
  Card,
  Table,
  Select,
  Space,
  Button,
  Tag,
  DatePicker,
  Modal,
  Input,
  message,
  type TablePaginationConfig,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { UndoOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { listOrders, refundOrder, type Order, type OrderStatus } from '../api/admin'

const statusColor: Record<OrderStatus, string> = {
  PENDING: 'orange',
  PAID: 'green',
  CANCELLED: 'default',
  REFUNDED: 'volcano',
}

const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '待支付', value: 'PENDING' },
  { label: '已支付', value: 'PAID' },
  { label: '已取消', value: 'CANCELLED' },
  { label: '已退款', value: 'REFUNDED' },
]

const { RangePicker } = DatePicker

export default function Orders() {
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)

  const [refundOpen, setRefundOpen] = useState(false)
  const [refundTarget, setRefundTarget] = useState<Order | null>(null)
  const [refundReason, setRefundReason] = useState('')
  const [refundLoading, setRefundLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listOrders({
        page,
        pageSize,
        status: (statusFilter || undefined) as OrderStatus | undefined,
        startDate: dateRange?.[0]?.toISOString(),
        endDate: dateRange?.[1]?.toISOString(),
      })
      setList(result.list)
      setTotal(result.total)
    } catch {
      // 错误已由拦截器提示
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, statusFilter, dateRange])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handleSearch = () => {
    setPage(1)
    void fetchData()
  }

  const openRefund = (record: Order) => {
    setRefundTarget(record)
    setRefundReason('')
    setRefundOpen(true)
  }

  const handleRefund = async () => {
    if (!refundTarget) return
    if (!refundReason.trim()) {
      message.warning('请填写退款原因')
      return
    }
    setRefundLoading(true)
    try {
      await refundOrder(refundTarget.id, refundReason)
      message.success('退款已发起')
      setRefundOpen(false)
      void fetchData()
    } catch {
      // 错误已由拦截器提示
    } finally {
      setRefundLoading(false)
    }
  }

  const columns: ColumnsType<Order> = [
    { title: '订单 ID', dataIndex: 'id', width: 200, ellipsis: true },
    { title: '用户 ID', dataIndex: 'userId', width: 200, ellipsis: true },
    { title: '套餐 ID', dataIndex: 'packageId', width: 200, ellipsis: true },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 100,
      render: (v: number) => `¥${v.toFixed(2)}`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v: OrderStatus) => <Tag color={statusColor[v]}>{v}</Tag>,
    },
    { title: '支付方式', dataIndex: 'paymentMethod', width: 100 },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_v: unknown, record: Order) => (
        <Button
          size="small"
          danger
          icon={<UndoOutlined />}
          disabled={record.status !== 'PAID'}
          onClick={() => openRefund(record)}
        >
          退款
        </Button>
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
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusOptions}
            style={{ width: 140 }}
          />
          <RangePicker
            value={dateRange}
            onChange={(dates) => setDateRange(dates as [Dayjs | null, Dayjs | null] | null)}
            showTime
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
          scroll={{ x: 1200 }}
        />
      </Card>

      <Modal
        title="订单退款"
        open={refundOpen}
        onOk={handleRefund}
        onCancel={() => setRefundOpen(false)}
        confirmLoading={refundLoading}
        okText="确认退款"
        okButtonProps={{ danger: true }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <span>订单：{refundTarget?.id}</span>
          <span>金额：¥{refundTarget?.amount.toFixed(2)}</span>
          <Input.TextArea
            rows={3}
            maxLength={256}
            placeholder="请填写退款原因"
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
          />
        </Space>
      </Modal>
    </>
  )
}
