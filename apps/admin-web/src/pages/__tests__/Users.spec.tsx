/**
 * Users 页面渲染测试
 *
 * mock 掉 api/admin 模块，验证：
 *  - 搜索区 / 筛选 / 查询按钮渲染
 *  - 列表渲染用户数据（昵称 / 手机号 / 状态 / 操作按钮）
 *  - 空数据时渲染空表格
 *
 * 注意：antd 会把纯文本二字按钮渲染为 "查 询"（autoInsertSpaceInButton），
 * 带图标的按钮 accessible name 包含图标名，如 "eye 详情"，故一律用子串正则匹配。
 */
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import Users from '../Users'
import { listUsers } from '../../api/admin'

jest.mock('../../api/admin', () => ({
  listUsers: jest.fn(),
  getUserDetail: jest.fn(),
  updateUserStatus: jest.fn(),
  updateUserRole: jest.fn(),
  grantPoints: jest.fn(),
}))

const mockedListUsers = listUsers as jest.MockedFunction<typeof listUsers>

describe('Users 页面', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('渲染搜索区、筛选与查询按钮', async () => {
    mockedListUsers.mockResolvedValue({ list: [], page: 1, pageSize: 20, total: 0 })

    render(<Users />)

    expect(screen.getByPlaceholderText('搜索昵称 / 手机号')).toBeInTheDocument()
    // antd autoInsertSpaceInButton 会把二字按钮渲染为 "查 询"
    expect(screen.getByRole('button', { name: /查\s*询/ })).toBeInTheDocument()
    await waitFor(() => expect(mockedListUsers).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(mockedListUsers).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, pageSize: 20 }),
      ),
    )
  })

  it('渲染用户列表数据', async () => {
    mockedListUsers.mockResolvedValue({
      list: [
        {
          id: 'u-1',
          nickname: '测试用户',
          mobile: '13800138000',
          avatarUrl: null,
          email: 't@example.com',
          currentPoints: 260,
          totalPoints: 300,
          status: 'ACTIVE',
          role: 'USER',
          lastLoginAt: null,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    })

    render(<Users />)

    expect(await screen.findByText('测试用户')).toBeInTheDocument()
    expect(screen.getByText('13800138000')).toBeInTheDocument()
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
    // 操作列按钮（antd 图标会拼进 accessible name，如 "eye 详情"，故用子串匹配）
    expect(screen.getByRole('button', { name: /详情/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /封禁/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /调账/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /角色/ })).toBeInTheDocument()
  })

  it('空数据时渲染空表格', async () => {
    mockedListUsers.mockResolvedValue({ list: [], page: 1, pageSize: 20, total: 0 })

    render(<Users />)

    // 未配置 zh_CN locale 时 antd 空态文案为英文（Table 可能渲染多处 "No data"）
    const emptyTexts = await screen.findAllByText('No data')
    expect(emptyTexts.length).toBeGreaterThan(0)
  })
})
