import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError, tokenStore } from '../lib/api'
import { db } from '../lib/db'
import type { User } from '../lib/types'

type AuthResponse = { user: User; token: string }

const USER_KEY = 'duofit.user'

const cachedUser = (): User | null => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null')
  } catch {
    return null
  }
}

const clearLocalData = () => Promise.all(db.tables.map((table) => table.clear()))

type AuthState = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (input: { email: string; password: string; name: string; inviteCode: string }) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => (tokenStore.get() ? cachedUser() : null))
  const [loading, setLoading] = useState(() => tokenStore.get() !== null && cachedUser() === null)

  useEffect(() => {
    if (!tokenStore.get()) return
    api<{ user: User }>('/auth/me')
      .then(({ user }) => {
        localStorage.setItem(USER_KEY, JSON.stringify(user))
        setUser(user)
      })
      .catch((error) => {
        // Offline at the gym: keep the cached session instead of logging out.
        if (error instanceof ApiError && error.status === 401) {
          tokenStore.clear()
          localStorage.removeItem(USER_KEY)
          setUser(null)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const handleAuth = useCallback(async ({ user, token }: AuthResponse) => {
    if (cachedUser()?.id !== user.id) await clearLocalData()
    tokenStore.set(token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
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

  const logout = useCallback(async () => {
    const unsynced = await db.outbox.count()
    if (unsynced > 0 && !confirm(`${unsynced} treino(s) ainda não sincronizado(s) serão perdidos. Sair mesmo assim?`)) return
    await clearLocalData()
    tokenStore.clear()
    localStorage.removeItem(USER_KEY)
    setUser(null)
  }, [])

  return <AuthContext value={{ user, loading, login, register, logout }}>{children}</AuthContext>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
