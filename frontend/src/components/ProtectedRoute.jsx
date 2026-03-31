import { Navigate, Outlet } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'

export default function ProtectedRoute() {
  const { token } = useAppContext()
  if (!token) {
    return <Navigate to="/auth" replace />
  }
  return <Outlet />
}
