/**
 * 对账监控页面
 *
 * 对接后端：
 *  - GET /api/v1/admin/reconcile/results?date=YYYY-MM-DD  查看对账结果
 *  - POST /api/v1/admin/reconcile                         手动触发对账
 *
 * 双 Tab：
 *  - 对账结果：DatePicker + Table（不一致记录列表，差额正负数颜色 + 一致性 Tag）
 *  - 手动触发：scope 单选（all / 指定用户）+ 触发按钮 + 结果摘要统计卡片
 */
import { useState, useCallback } from 'react'
import {
  Card,
  Tabs,
  Table,
  DatePicker,
  Button,
  Space,
  Tag,
  Form,
  Radio,
  Input,
  Statistic,
  Row,
  Col,
  Spin,
  message,
  type TablePaginationConfig,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import {
  getReconcileResults,
  triggerReconcile,
  type ReconcileResultItem,
  type ReconcileSummary,
} from '../api/admin'

// -------------------- 对账结果 Tab --------------------

function ReconcileResultsTab() {
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<ReconcileResultItem[]>([])
  const [date, setDate] = useState<dayjs.Dayjs | null>(dayjs())

  const fetchData = useCallback(async (d: dayjs.Dayjs | null) => {
    setLoading(true)
    try {
      const result = await getReconcileResults(d?.format('YYYY-MM-DD'))
      setList(result)
    } catch {
      // 错误已由拦截器提示
    } finally {
      setLoading(false)
    }
  }, [])

  const handleSearch = () => {
    void fetchData(date)
  }

  const inconsistentCount = list.filter((item) => !item.isConsistent).length

  const columns: ColumnsType<ReconcileResultItem> = [
    { title: '用户 ID', dataIndex: 'userId', width: 200, ellipsis: true },
    { title: '用户余额', dataIndex: 'userBalance', width: 110 },
    { title: '流水余额', dataIndex: 'txBalance', width: 110 },
    { title: '冻结积分', dataIndex: 'frozen', width: 110 },
    { title: '期望余额', dataIndex: 'expectedBalance', width: 110 },
    {
      title: '差额',
      dataIndex: 'difference',
      width: 110,
      render: (v: number) => (
        <span
          style={{
            color: v === 0 ? '#10B981' : '#EF4444',
            fontWeight: 600,
          }}
        >
          {v > 0 ? `+${v}` : v}
        </span>
      ),
    },
    {
      title: '一致性',
      dataIndex: 'isConsistent',
      width: 100,
      render: (v: boolean) => (v ? <Tag color="green">一致</Tag> : <Tag color="red">不一致</Tag>),
    },
  ]

  const pagination: TablePaginationConfig = {
    showSizeChanger: true,
    showTotal: (t) => `共 ${t} 条`,
    pageSize: 20,
  }

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <DatePicker
            value={date}
            onChange={(d) => setDate(d)}
            allowClear
            placeholder="选择对账日期"
          />
          <Button type="primary" onClick={handleSearch}>
            查询
          </Button>
        </Space>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col xs={24} sm={12} lg={8}>
            <Statistic title="记录总数" value={list.length} />
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Statistic
              title="不一致记录"
              value={inconsistentCount}
              valueStyle={{ color: inconsistentCount > 0 ? '#EF4444' : '#10B981' }}
            />
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Statistic
              title="一致率"
              value={
                list.length === 0
                  ? '-'
                  : `${(((list.length - inconsistentCount) / list.length) * 100).toFixed(2)}%`
              }
            />
          </Col>
        </Row>
      </Card>

      <Card>
        <Table
          rowKey="userId"
          columns={columns}
          dataSource={list}
          loading={loading}
          pagination={pagination}
          scroll={{ x: 900 }}
        />
      </Card>
    </>
  )
}

// -------------------- 手动触发 Tab --------------------

interface TriggerFormValues {
  scopeType: 'all' | 'user'
  userId?: string
}

function ReconcileTriggerTab() {
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<ReconcileSummary | null>(null)
  const [form] = Form.useForm<TriggerFormValues>()

  const handleTrigger = async () => {
    const values = await form.validateFields()
    const scope = values.scopeType === 'all' ? 'all' : `userId:${values.userId?.trim() ?? ''}`

    if (values.scopeType === 'user' && !values.userId?.trim()) {
      message.warning('请输入用户 ID')
      return
    }

    setLoading(true)
    try {
      const result = await triggerReconcile(scope)
      setSummary(result)
      message.success('对账已完成')
    } catch {
      // 错误已由拦截器提示
    } finally {
      setLoading(false)
    }
  }

  const inconsistentCount = summary?.inconsistentCount ?? 0
  const consistentCount =
    summary && summary.totalUsers > 0 ? summary.totalUsers - inconsistentCount : 0

  return (
    <Spin spinning={loading}>
      <Card title="手动触发对账" style={{ maxWidth: 600, marginBottom: 16 }}>
        <Form<TriggerFormValues> form={form} layout="vertical" initialValues={{ scopeType: 'all' }}>
          <Form.Item name="scopeType" label="对账范围">
            <Radio.Group>
              <Radio value="all">全部用户</Radio>
              <Radio value="user">指定用户</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.scopeType !== curr.scopeType}>
            {({ getFieldValue }) =>
              getFieldValue('scopeType') === 'user' ? (
                <Form.Item
                  name="userId"
                  label="用户 ID"
                  rules={[{ required: true, message: '请输入用户 ID' }]}
                >
                  <Input placeholder="目标用户 UUID" />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item>
            <Button type="primary" loading={loading} onClick={handleTrigger}>
              触发对账
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {summary && (
        <Card title="对账结果摘要">
          <Row gutter={16}>
            <Col xs={24} sm={12} lg={6}>
              <Statistic title="总用户数" value={summary.totalUsers} />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Statistic title="一致" value={consistentCount} valueStyle={{ color: '#10B981' }} />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Statistic
                title="不一致"
                value={inconsistentCount}
                valueStyle={{ color: inconsistentCount > 0 ? '#EF4444' : '#10B981' }}
              />
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Statistic
                title="耗时"
                value={
                  summary.startedAt && summary.finishedAt
                    ? dayjs(summary.finishedAt).diff(dayjs(summary.startedAt), 'second')
                    : 0
                }
                suffix="秒"
              />
            </Col>
          </Row>
          <Space style={{ marginTop: 16, color: '#999', fontSize: 12 }}>
            <span>开始：{dayjs(summary.startedAt).format('YYYY-MM-DD HH:mm:ss')}</span>
            <span>完成：{dayjs(summary.finishedAt).format('YYYY-MM-DD HH:mm:ss')}</span>
            {summary.date && <span>对账日期：{summary.date}</span>}
          </Space>
        </Card>
      )}
    </Spin>
  )
}

// -------------------- 主页面 --------------------

export default function Reconcile() {
  const [tab, setTab] = useState<'results' | 'trigger'>('results')

  const tabItems = [
    {
      key: 'results',
      label: '对账结果',
      children: <ReconcileResultsTab />,
    },
    {
      key: 'trigger',
      label: '手动触发',
      children: <ReconcileTriggerTab />,
    },
  ]

  return (
    <Tabs activeKey={tab} onChange={(k) => setTab(k as 'results' | 'trigger')} items={tabItems} />
  )
}
