/**
 * Reconcile 页面渲染测试
 *
 * mock 掉 api/admin 模块，验证：
 *  - 双 Tab（对账结果 / 手动触发）渲染
 *  - 对账结果 Tab：查询按钮 + 统计卡
 *  - 手动触发 Tab：范围单选 + 触发按钮（radio 切换显示用户 ID 输入框）
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import Reconcile from '../Reconcile'
import { getReconcileResults, triggerReconcile } from '../../api/admin'

jest.mock('../../api/admin', () => ({
  getReconcileResults: jest.fn(),
  triggerReconcile: jest.fn(),
}))

const mockedGetResults = getReconcileResults as jest.MockedFunction<typeof getReconcileResults>
const mockedTrigger = triggerReconcile as jest.MockedFunction<typeof triggerReconcile>

describe('Reconcile 页面', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('渲染双 Tab 与对账结果统计卡', async () => {
    mockedGetResults.mockResolvedValue([])

    render(<Reconcile />)

    expect(screen.getByText('对账结果')).toBeInTheDocument()
    expect(screen.getByText('手动触发')).toBeInTheDocument()
    // antd autoInsertSpaceInButton 会把二字按钮渲染为 "查 询"
    expect(screen.getByRole('button', { name: /查\s*询/ })).toBeInTheDocument()
    expect(screen.getByText('记录总数')).toBeInTheDocument()
    expect(screen.getByText('不一致记录')).toBeInTheDocument()
    expect(screen.getByText('一致率')).toBeInTheDocument()
  })

  it('查询后渲染不一致列表与差额', async () => {
    mockedGetResults.mockResolvedValue([
      {
        userId: 'u-1',
        userBalance: 100,
        txBalance: 90,
        frozen: 0,
        expectedBalance: 100,
        difference: 10,
        isConsistent: false,
      },
    ])

    render(<Reconcile />)

    fireEvent.click(screen.getByRole('button', { name: /查\s*询/ }))

    expect(await screen.findByText('u-1')).toBeInTheDocument()
    expect(screen.getByText('+10')).toBeInTheDocument()
    expect(screen.getByText('不一致')).toBeInTheDocument()
  })

  it('手动触发 Tab：切换指定用户时显示用户 ID 输入框，填写后可触发', async () => {
    mockedTrigger.mockResolvedValue({
      totalUsers: 1,
      inconsistentCount: 0,
      results: [],
      date: '2026-08-25',
      startedAt: '2026-08-25T00:00:00Z',
      finishedAt: '2026-08-25T00:00:02Z',
    })

    render(<Reconcile />)

    // 切到手动触发 Tab
    fireEvent.click(screen.getByRole('tab', { name: '手动触发' }))

    // 默认"全部用户"，无用户 ID 输入框
    expect(screen.queryByPlaceholderText('目标用户 UUID')).not.toBeInTheDocument()

    // 切换"指定用户"后显示输入框
    fireEvent.click(screen.getByText('指定用户'))
    expect(screen.getByPlaceholderText('目标用户 UUID')).toBeInTheDocument()

    // 填写用户 ID 后触发对账，回显摘要
    fireEvent.change(screen.getByPlaceholderText('目标用户 UUID'), { target: { value: 'u-1' } })
    fireEvent.click(screen.getByRole('button', { name: /触发对账/ }))

    expect(await screen.findByText('对账结果摘要')).toBeInTheDocument()
    await waitFor(() => expect(mockedTrigger).toHaveBeenCalledWith('userId:u-1'))
  })
})
