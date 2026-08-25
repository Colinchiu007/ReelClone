/**
 * ListPage —— 通用列表页组件（搜索栏 + 分页表格）
 *
 * 抽取 admin-web 各列表页（Users / Orders / PointsFlow）的公共骨架：
 *  - loading / list / total / page / pageSize 状态
 *  - 数据拉取（page 变化 / 搜索 / reloadToken 变化时自动重新拉取）
 *  - 搜索栏（antd Form 承载筛选字段）+ 查询按钮
 *  - 分页 Table + 分页器
 *
 * 用法：
 *  <ListPage
 *    rowKey="id"
 *    columns={columns}
 *    fetcher={({ page, pageSize, filters }) => fetchList({ page, pageSize, ...filters })}
 *    filterFields={
 *      <>
 *        <Form.Item name="keyword" noStyle>
 *          <Input placeholder="搜索关键字" allowClear />
 *        </Form.Item>
 *        <Form.Item name="status" noStyle>
 *          <Select options={statusOptions} style={{ width: 130 }} />
 *        </Form.Item>
 *      </>
 *    }
 *    initialFilters={{ keyword: '', status: '' }}
 *    scrollX={1000}
 *    reloadToken={reloadToken}
 *  />
 *
 * 操作（封禁/退款等）成功后通过递增 reloadToken 触发刷新：
 *  const [reloadToken, setReloadToken] = useState(0)
 *  // ... mutation 成功后
 *  setReloadToken((t) => t + 1)
 */
import { useEffect, useState, useCallback, type ReactNode } from 'react'
import { Card, Table, Form, Button, Space, type TablePaginationConfig } from 'antd'
import type { ColumnsType } from 'antd/es/table'

export interface ListResult<T> {
  list: T[]
  total: number
}

export interface PageParams<F> {
  page: number
  pageSize: number
  filters: F
}

export interface ListPageProps<T, F = Record<string, unknown>> {
  /** Table rowKey */
  rowKey: string | ((record: T) => string | number)
  /** Table 列定义 */
  columns: ColumnsType<T>
  /** 数据获取：接收分页与筛选表单值，返回 { list, total }（需 useCallback 保持稳定） */
  fetcher: (params: PageParams<F>) => Promise<ListResult<T>>
  /** 搜索表单字段（渲染在查询 Card 内，用 Form.Item name 绑定值） */
  filterFields?: ReactNode
  /** 搜索表单初始值 */
  initialFilters?: F
  /** 初始每页条数 */
  defaultPageSize?: number
  /** Table 横向滚动宽度（设置 scroll={{ x }}） */
  scrollX?: number
  /** reloadToken 变化时自动重新拉取（用于操作成功后刷新） */
  reloadToken?: number | string
  /** 查询按钮文案，默认「查询」 */
  searchText?: string
  /** 是否渲染搜索栏，默认 true */
  showSearchBar?: boolean
}

export default function ListPage<T, F = Record<string, unknown>>({
  rowKey,
  columns,
  fetcher,
  filterFields,
  initialFilters,
  defaultPageSize = 20,
  scrollX,
  reloadToken,
  searchText = '查询',
  showSearchBar = true,
}: ListPageProps<T, F>) {
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize)
  // 每次查询递增，确保筛选值变化而页码不变时也能触发重新拉取
  const [searchNonce, setSearchNonce] = useState(0)
  const [form] = Form.useForm<F>()

  const fetchData = useCallback(
    async (p: number, ps: number, values: F) => {
      setLoading(true)
      try {
        const result = await fetcher({ page: p, pageSize: ps, filters: values })
        setList(result.list)
        setTotal(result.total)
      } catch {
        // 错误已由拦截器提示
      } finally {
        setLoading(false)
      }
    },
    [fetcher],
  )

  useEffect(() => {
    const values = form.getFieldsValue() as F
    void fetchData(page, pageSize, values)
    // 表单值由搜索动作驱动，无需纳入依赖；page/pageSize 变化由分页器驱动
  }, [fetchData, page, pageSize, reloadToken, searchNonce])

  const handleSearch = useCallback(() => {
    setPage(1)
    setSearchNonce((n) => n + 1)
  }, [])

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
      {showSearchBar ? (
        <Card style={{ marginBottom: 16 }}>
          {/* 筛选类型 F 为页面级 interface，无索引签名，需转成 antd Store 类型 */}
          <Form<F>
            form={form}
            initialValues={initialFilters as unknown as Record<string, unknown>}
            onFinish={handleSearch}
          >
            <Space wrap>
              {filterFields}
              <Button type="primary" htmlType="submit">
                {searchText}
              </Button>
            </Space>
          </Form>
        </Card>
      ) : null}

      <Card>
        <Table<T>
          rowKey={rowKey}
          columns={columns}
          dataSource={list}
          loading={loading}
          pagination={pagination}
          scroll={scrollX ? { x: scrollX } : undefined}
        />
      </Card>
    </>
  )
}
