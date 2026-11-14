import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../lib/api'
import { Loading, Offline, useApi } from '../../lib/useApi'
import { formatDuration } from '../../lib/workout'

export type SessionSummary = {
  id: string
  name: string
  startedAt: string
  durationSeconds: number
  sets: number
  exercises: number
  volume: number
  records: number
}

export const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })

export function SessionCard({ session, to }: { session: SessionSummary; to?: string }) {
  const content = (
    <>
      <div className="flex items-baseline justify-between">
        <p className="font-semibold">{session.name}</p>
        <p className="text-xs text-zinc-500">{formatDay(session.startedAt)}</p>
      </div>
      <p className="text-sm text-zinc-400">
        {formatDuration(session.durationSeconds)} · {session.exercises} exercícios · {session.sets} séries ·{' '}
        {session.volume.toLocaleString('pt-BR')} kg
        {session.records > 0 && <span className="ml-1 text-lime-400">· {session.records} PR 🏆</span>}
      </p>
    </>
  )
  const className = 'grid gap-1 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4'
  return to ? <Link to={to} className={className}>{content}</Link> : <div className={className}>{content}</div>
}

export function HistoryTab() {
  const { data, error, setData } = useApi<{ sessions: SessionSummary[] }>('/progress/sessions')
  const [loadingMore, setLoadingMore] = useState(false)
  const [done, setDone] = useState(false)

  if (error) return <Offline />
  if (!data) return <Loading />
  if (data.sessions.length === 0) return <p className="py-10 text-center text-zinc-500">Nenhum treino finalizado ainda.</p>

  async function loadMore() {
    const last = data!.sessions.at(-1)!
    setLoadingMore(true)
    const more = await api<{ sessions: SessionSummary[] }>(`/progress/sessions?before=${encodeURIComponent(last.startedAt)}`)
    setData({ sessions: [...data!.sessions, ...more.sessions] })
    if (more.sessions.length < 20) setDone(true)
    setLoadingMore(false)
  }

  return (
    <div className="grid gap-3">
      {data.sessions.map((s) => <SessionCard key={s.id} session={s} to={`/progresso/treino/${s.id}`} />)}
      {!done && data.sessions.length >= 20 && (
        <button onClick={loadMore} disabled={loadingMore} className="py-3 text-sm text-lime-400">
          {loadingMore ? 'Carregando…' : 'Carregar mais'}
        </button>
      )}
    </div>
  )
}
