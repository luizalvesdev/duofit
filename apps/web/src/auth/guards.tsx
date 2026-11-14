import { Navigate, Outlet } from 'react-router'
import { useAuth } from './AuthContext'

export function RequireAuth() {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-dvh grid place-items-center text-zinc-500">Carregando…</div>
  return user ? <Outlet /> : <Navigate to="/login" replace />
}

export function GuestOnly() {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? <Navigate to="/" replace /> : <Outlet />
}
