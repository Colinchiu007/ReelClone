import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import AdminLayout from './layouts/AdminLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import PointsFlow from './pages/PointsFlow'
import Users from './pages/Users'
import Reviews from './pages/Reviews'
import Content from './pages/Content'
import Packages from './pages/Packages'
import Orders from './pages/Orders'
import Reconcile from './pages/Reconcile'
import Notifications from './pages/Notifications'
import SystemConfig from './pages/SystemConfig'
import { getToken } from './stores/auth'

/** 路由守卫：无 token 时跳转登录页 */
function ProtectedRoute() {
  if (!getToken()) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AdminLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="points-flow" element={<PointsFlow />} />
            <Route path="users" element={<Users />} />
            <Route path="reviews" element={<Reviews />} />
            <Route path="content" element={<Content />} />
            <Route path="packages" element={<Packages />} />
            <Route path="orders" element={<Orders />} />
            <Route path="reconcile" element={<Reconcile />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="system-config" element={<SystemConfig />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
