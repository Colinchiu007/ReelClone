/**
 * Orders 页面渲染测试
 *
 * mock 掉 api/admin 模块，验证：
 *  - 筛选区 / 查询按钮渲染
 *  - 列表渲染订单数据（金额格式 / 状态 / 退款按钮）
 *  - 未支付订单退款按钮禁用
 */
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import Orders from '../Orders'
import { listOrders } from '../../api/admin'

jest.mock('../../api/admin', () => ({
  listOrders: jest.fn(),
  refundOrder: jest.fn(),
}))

const mockedListOrders = listOrders as jest.MockedFunction<typeof listOrders>

describe('Orders 页面', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('渲染筛选区与查询按钮', async () => {
    mockedListOrders.mockResolvedValue({ list: [], page: 1, pageSize: 20, total: 0 })

    render(<Orders />)

    // antd autoInsertSpaceInButton 会把二字按钮渲染为 "查 询"
    expect(screen.getByRole('button', { name: /查\s*询/ })).toBeInTheDocument()
    await waitFor(() => expect(mockedListOrders).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(mockedListOrders).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, pageSize: 20 }),
      ),
    )
  })

  it('渲染订单列表数据与金额格式', async () => {
    mockedListOrders.mockResolvedValue({
      list: [
        {
          id: 'order-1',
          userId: 'u-1',
          packageId: 'pkg-1',
          amount: 29.99,
          status: 'PAID',
          paymentMethod: 'WECHAT',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    })

    render(<Orders />)

    expect(await screen.findByText('order-1')).toBeInTheDocument()
    expect(screen.getByText('¥29.99')).toBeInTheDocument()
    expect(screen.getByText('PAID')).toBeInTheDocument()
    // 已支付订单可退款（按钮带 undo 图标，accessible name 为 "undo 退款"）
    expect(screen.getByRole('button', { name: /退款/ })).not.toBeDisabled()
  })

  it('未支付订单退款按钮禁用', async () => {
    mockedListOrders.mockResolvedValue({
      list: [
        {
          id: 'order-2',
          userId: 'u-2',
          packageId: 'pkg-2',
          amount: 9.9,
          status: 'PENDING',
          paymentMethod: 'WECHAT',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    })

    render(<Orders />)

    expect(await screen.findByText('order-2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /退款/ })).toBeDisabled()
  })
})
