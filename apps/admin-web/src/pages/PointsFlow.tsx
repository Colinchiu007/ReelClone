/**
 * 积分流水页面
 *
 * 对接后端 GET /api/v1/admin/stats/points-flow
 * 支持 userId 筛选 + 时间范围筛选 + 分页
 * type 用 Tag 颜色区分；amount 正数绿色、负数红色
 */
import { useEffect, useState, useCallback } from 'react'
import {
  Card,
  Table,
  Input,
  Space,
  Button,
  Tag,
  DatePicker,
  type TablePaginationConfig,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { listPointsFlow, type PointsFlowItem, type PointTxType } from '../api/admin'

const typeColor: Record<PointTxType, string> = {
  FREEZE: 'orange',
  SETTLE: 'blue',
  RELEASE: 'cyan',
  GRANT: 'purple',
  CONSUME: 'red',
}

const typeLabel: Record<PointTxType, string> = {
  FREEZE: '冻结',
  SETTLE: '结算',
  RELEASE: '释放',
  GRANT: '赠送',
  CONSUME: '消耗',
}

const { RangePicker } = DatePicker

export default function PointsFlow() {
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<PointsFlowItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [userId, setUserId] = useState<string>('')
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listPointsFlow({
        page,
        pageSize,
        userId: userId.trim() || undefined,
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
  }, [page, pageSize, userId, dateRange])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handleSearch = () => {
    setPage(1)
    void fetchData()
  }

  const columns: ColumnsType<PointsFlowItem> = [
    { title: '流水 ID', dataIndex: 'id', width: 200, ellipsis: true },
    { title: '用户 ID', dataIndex: 'userId', width: 200, ellipsis: true },
    {
      title: '类型',
      dataIndex: 'type',
      width: 100,
      render: (v: PointTxType) => <Tag color={typeColor[v]}>{typeLabel[v] ?? v}</Tag>,
    },
    {
      title: '变动数量',
      dataIndex: 'amount',
      width: 110,
      render: (v: number) => (
        <span style={{ color: v >= 0 ? '#10B981' : '#EF4444', fontWeight: 600 }}>
          {v >= 0 ? `+${v}` : v}
        </span>
      ),
    },
    { title: '变更后余额', dataIndex: 'balance', width: 110 },
    {
      title: '来源说明',
      dataIndex: 'source',
      width: 200,
      ellipsis: true,
      render: (v: string | null) => v ?? '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
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
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="用户 ID 筛选"
            style={{ width: 240 }}
            allowClear
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
          scroll={{ x: 1100 }}
        />
      </Card>
    </>
  )
}
