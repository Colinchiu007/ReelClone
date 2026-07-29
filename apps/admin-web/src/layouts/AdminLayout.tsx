import { useState } from 'react'
import { Layout, Menu, Dropdown, Avatar, Space, Typography, Breadcrumb, type MenuProps } from 'antd'
import {
  DashboardOutlined,
  TeamOutlined,
  AuditOutlined,
  AppstoreOutlined,
  GiftOutlined,
  ShoppingOutlined,
  NotificationOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { getUser, clearAuth } from '../stores/auth'

const { Sider, Header, Content } = Layout
const { Text } = Typography

const menuItems: NonNullable<MenuProps['items']> = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/users', icon: <TeamOutlined />, label: '用户管理' },
  { key: '/reviews', icon: <AuditOutlined />, label: '审核工作台' },
  { key: '/content', icon: <AppstoreOutlined />, label: '内容管理' },
  { key: '/packages', icon: <GiftOutlined />, label: '套餐管理' },
  { key: '/orders', icon: <ShoppingOutlined />, label: '订单管理' },
  { key: '/notifications', icon: <NotificationOutlined />, label: '通知推送' },
  { key: '/system-config', icon: <SettingOutlined />, label: '系统配置' },
]

const breadcrumbMap: Record<string, string> = {
  dashboard: 'Dashboard',
  users: '用户管理',
  reviews: '审核工作台',
  content: '内容管理',
  packages: '套餐管理',
  orders: '订单管理',
  notifications: '通知推送',
  'system-config': '系统配置',
}

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const user = getUser()

  // 当前选中的菜单 key（取路径第一段）
  const pathSegments = location.pathname.split('/').filter(Boolean)
  const selectedKey = '/' + (pathSegments[0] ?? 'dashboard')
  const currentLabel = breadcrumbMap[pathSegments[0] ?? 'dashboard'] ?? ''

  const handleLogout = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }

  const dropdownItems: MenuProps['items'] = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="dark" width={220}>
        <div className="sider-logo">
          {collapsed ? <span>RC</span> : <span>ReelClone Admin</span>}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}
        >
          <Space>
            <span
              style={{ fontSize: 16, cursor: 'pointer' }}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </span>
          </Space>
          <Dropdown menu={{ items: dropdownItems }} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} style={{ background: '#4F46E5' }} />
              <Text>{user?.nickname ?? '管理员'}</Text>
            </Space>
          </Dropdown>
        </Header>
        <Content className="page-content">
          <Breadcrumb style={{ marginBottom: 16 }}>
            <Breadcrumb.Item>运营后台</Breadcrumb.Item>
            <Breadcrumb.Item>{currentLabel}</Breadcrumb.Item>
          </Breadcrumb>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
