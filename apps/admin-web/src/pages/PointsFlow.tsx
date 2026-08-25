/**
 * 积分流水页面
 *
 * 对接后端 GET /api/v1/admin/stats/points-flow
 * 支持 userId 筛选 + 时间范围筛选 + 分页
 * type 用 Tag 颜色区分；amount 正数绿色、负数红色
 */
import { useCallback } from 'react'
import { Input, Tag, DatePicker, Form } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import ListPage, { type PageParams } from '../components/ListPage'
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

interface PointsFlowFilters {
  userId?: string
  dateRange?: [Dayjs | null, Dayjs | null] | null
}

export default function PointsFlow() {
  const fetchFlow = useCallback(
    async ({ page, pageSize, filters }: PageParams<PointsFlowFilters>) => {
      const result = await listPointsFlow({
        page,
        pageSize,
        userId: filters.userId?.trim() || undefined,
        startDate: filters.dateRange?.[0]?.toISOString(),
        endDate: filters.dateRange?.[1]?.toISOString(),
      })
      return { list: result.list, total: result.total }
    },
    [],
  )

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

  return (
    <ListPage<PointsFlowItem, PointsFlowFilters>
      rowKey="id"
      columns={columns}
      fetcher={fetchFlow}
      filterFields={
        <>
          <Form.Item name="userId" noStyle>
            <Input placeholder="用户 ID 筛选" style={{ width: 240 }} allowClear />
          </Form.Item>
          <Form.Item name="dateRange" noStyle>
            <RangePicker showTime />
          </Form.Item>
        </>
      }
      initialFilters={{ userId: '', dateRange: null }}
      scrollX={1100}
    />
  )
}
