import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, tokenStore } from '../lib/api'
import type { User } from '../lib/types'

type AuthResponse = { user: User; token: string }

type AuthState = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (input: { email: string; password: string; name: string; inviteCode: string }) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(() => tokenStore.get() !== null)

  useEffect(() => {
    if (!tokenStore.get()) return
    api<{ user: User }>('/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false))
  }, [])

  const handleAuth = useCallback(({ user, token }: AuthResponse) => {
    tokenStore.set(token)
    setUser(user)
  }, [])

  const login = useCallback(
    async (email: string, password: string) =>
      handleAuth(await api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } })),
    [handleAuth],
  )

  const register = useCallback<AuthState['register']>(
    async (input) => handleAuth(await api<AuthResponse>('/auth/register', { method: 'POST', body: input })),
    [handleAuth],
  )

  const logout = useCallback(() => {
    tokenStore.clear()
    setUser(null)
  }, [])

  return <AuthContext value={{ user, loading, login, register, logout }}>{children}</AuthContext>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
