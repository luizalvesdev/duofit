import { useCallback, useEffect, useState } from 'react'
import { api } from './api'

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!path) return
    let cancelled = false
    setError(false)
    api<T>(path)
      .then((result) => !cancelled && setData(result))
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [path, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { data, error, reload, setData }
}

export const Loading = () => <p className="py-10 text-center text-sm text-zinc-500">Carregando…</p>
export const Offline = () => <p className="py-10 text-center text-sm text-zinc-500">Sem conexão. Tente de novo com internet.</p>
