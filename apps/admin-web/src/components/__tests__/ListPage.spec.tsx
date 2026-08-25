/**
 * @jest-environment jsdom
 *
 * ListPage 通用列表页组件测试
 *
 * 覆盖场景：
 *  - 挂载后调用 fetcher 并渲染列表
 *  - 渲染搜索栏（filterFields）与查询按钮
 *  - 点击查询后重置页码并携带筛选值重新拉取
 *  - reloadToken 变化时自动重新拉取（操作后刷新）
 *  - 翻页时以新页码重新拉取
 */
import { useState } from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Input, Form } from 'antd'
import ListPage, { type PageParams } from '../ListPage'

interface Item {
  id: string
  name: string
}

interface Filters {
  keyword?: string
}

const columns = [
  { title: 'ID', dataIndex: 'id' },
  { title: '名称', dataIndex: 'name' },
]

describe('ListPage', () => {
  it('挂载后调用 fetcher 并渲染列表', async () => {
    const fetcher = jest.fn().mockResolvedValue({ list: [{ id: 'item-1', name: '甲' }], total: 1 })

    render(
      <ListPage<Item, Filters>
        rowKey="id"
        columns={columns}
        fetcher={fetcher}
        filterFields={
          <Form.Item name="keyword" noStyle>
            <Input placeholder="搜索关键字" />
          </Form.Item>
        }
        initialFilters={{ keyword: '' }}
      />,
    )

    expect(await screen.findByText('item-1')).toBeInTheDocument()
    expect(screen.getByText('甲')).toBeInTheDocument()
    expect(fetcher).toHaveBeenCalledTimes(1)
    const call = fetcher.mock.calls[0][0] as PageParams<Filters>
    expect(call.page).toBe(1)
    expect(call.pageSize).toBe(20)
    expect(call.filters).toEqual(expect.objectContaining({ keyword: '' }))
  })

  it('渲染搜索栏（筛选字段 + 查询按钮）', async () => {
    const fetcher = jest.fn().mockResolvedValue({ list: [], total: 0 })

    render(
      <ListPage<Item, Filters>
        rowKey="id"
        columns={columns}
        fetcher={fetcher}
        filterFields={
          <Form.Item name="keyword" noStyle>
            <Input placeholder="搜索关键字" />
          </Form.Item>
        }
        initialFilters={{ keyword: '' }}
      />,
    )

    expect(await screen.findByPlaceholderText('搜索关键字')).toBeInTheDocument()
    // antd autoInsertSpaceInButton 会把二字按钮渲染为 "查 询"
    expect(screen.getByRole('button', { name: /查\s*询/ })).toBeInTheDocument()
  })

  it('点击查询后携带最新筛选值重新拉取', async () => {
    const fetcher = jest.fn().mockResolvedValue({ list: [], total: 0 })

    render(
      <ListPage<Item, Filters>
        rowKey="id"
        columns={columns}
        fetcher={fetcher}
        filterFields={
          <Form.Item name="keyword" noStyle>
            <Input placeholder="搜索关键字" />
          </Form.Item>
        }
        initialFilters={{ keyword: '' }}
      />,
    )

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByPlaceholderText('搜索关键字'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }))

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    const call = fetcher.mock.calls[1][0] as PageParams<Filters>
    expect(call.page).toBe(1)
    expect(call.filters).toEqual(expect.objectContaining({ keyword: 'abc' }))
  })

  it('reloadToken 变化时自动重新拉取', async () => {
    const fetcher = jest.fn().mockResolvedValue({ list: [], total: 0 })

    function Wrapper() {
      const [token, setToken] = useState(0)
      return (
        <>
          <ListPage<Item, Filters>
            rowKey="id"
            columns={columns}
            fetcher={fetcher}
            reloadToken={token}
          />
          <button onClick={() => setToken((t) => t + 1)}>refresh</button>
        </>
      )
    }

    render(<Wrapper />)

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  })

  it('翻页时以新页码重新拉取', async () => {
    const fetcher = jest.fn().mockResolvedValue({ list: [{ id: 'item-1' }], total: 100 })

    render(
      <ListPage<Item, Filters>
        rowKey="id"
        columns={columns}
        fetcher={fetcher}
        initialFilters={{ keyword: '' }}
      />,
    )

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByTitle('2'))

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    const call = fetcher.mock.calls[1][0] as PageParams<Filters>
    expect(call.page).toBe(2)
  })
})
