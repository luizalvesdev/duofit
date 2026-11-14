const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'
const TOKEN_KEY = 'duofit.token'

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get()
  const response = await fetch(`${BASE_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(response.status, data.error ?? 'unknown_error')
  return data as T
}
