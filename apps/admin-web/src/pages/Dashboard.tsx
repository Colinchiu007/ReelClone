import { useEffect, useState, useCallback } from 'react'
import { Card, Col, Row, Statistic, Segmented, Spin } from 'antd'
import {
  TeamOutlined,
  UserAddOutlined,
  DollarOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { getOverview, type OverviewResult, type OverviewRange } from '../api/admin'

interface ChartPoint {
  date: string
  dau: number
  newUsers: number
  gmv: number
}

export default function Dashboard() {
  const [loading, setLoading] = useState(false)
  const [range, setRange] = useState<OverviewRange>('7d')
  const [data, setData] = useState<OverviewResult | null>(null)

  const fetchData = useCallback(async (r: OverviewRange) => {
    setLoading(true)
    try {
      const result = await getOverview(r)
      setData(result)
    } catch {
      // 错误已由拦截器提示
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData(range)
  }, [range, fetchData])

  const chartData: ChartPoint[] = data
    ? data.trends.dates.map((date, i) => ({
        date: date.slice(5),
        dau: data.trends.dau[i] ?? 0,
        newUsers: data.trends.newUsers[i] ?? 0,
        gmv: data.trends.gmv[i] ?? 0,
      }))
    : []

  return (
    <Spin spinning={loading}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Segmented
          options={[
            { label: '近 7 天', value: '7d' },
            { label: '近 30 天', value: '30d' },
          ]}
          value={range}
          onChange={(v) => setRange(v as OverviewRange)}
        />
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <Statistic
              title="DAU（日活）"
              value={data?.dau ?? 0}
              prefix={<TeamOutlined style={{ color: '#4F46E5' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <Statistic
              title="新增用户"
              value={data?.newUsers ?? 0}
              prefix={<UserAddOutlined style={{ color: '#7C3AED' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <Statistic
              title="GMV（元）"
              value={data?.gmv ?? 0}
              precision={2}
              prefix={<DollarOutlined style={{ color: '#10B981' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <Statistic
              title="生成量"
              value={data?.generationCount ?? 0}
              prefix={<ThunderboltOutlined style={{ color: '#F59E0B' }} />}
            />
          </Card>
        </Col>
      </Row>

      <Card title="趋势图" style={{ marginTop: 16 }}>
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="dau"
              name="DAU"
              stroke="#4F46E5"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="newUsers"
              name="新增用户"
              stroke="#7C3AED"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="gmv"
              name="GMV"
              stroke="#10B981"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </Spin>
  )
}
