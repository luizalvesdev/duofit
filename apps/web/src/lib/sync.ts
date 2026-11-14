import { api } from './api'
import { db, type LastPerformance } from './db'
import type { Best, Exercise, SetType, Template } from './workout'

type HistoryResponse = {
  sessions: { id: string; startedAt: string }[]
  sets: {
    sessionId: string
    exerciseId: string
    setPosition: number
    setType: SetType
    weightKg: number
    reps: number
  }[]
  records: Best[]
}

let flushing: Promise<void> | null = null

export function flushOutbox() {
  flushing ??= (async () => {
    try {
      const pending = await db.outbox.orderBy('createdAt').toArray()
      for (const item of pending) {
        await api(`/sessions/${item.id}`, { method: 'PUT', body: item.payload })
        await db.outbox.delete(item.id)
      }
    } finally {
      flushing = null
    }
  })()
  return flushing
}

function lastPerformanceFrom(history: HistoryResponse): LastPerformance[] {
  const sessionOrder = new Map(history.sessions.map((s, index) => [s.id, index]))
  const latest = new Map<string, string>()
  for (const set of history.sets) {
    const current = latest.get(set.exerciseId)
    if (!current || sessionOrder.get(set.sessionId)! < sessionOrder.get(current)!) latest.set(set.exerciseId, set.sessionId)
  }

  return [...latest].map(([exerciseId, sessionId]) => ({
    exerciseId,
    sets: history.sets
      .filter((s) => s.exerciseId === exerciseId && s.sessionId === sessionId)
      .sort((a, b) => a.setPosition - b.setPosition)
      .map(({ setType, weightKg, reps }) => ({ setType, weightKg, reps })),
  }))
}

// Pull server state into IndexedDB so a workout can run with no connection.
export async function refreshCache() {
  await flushOutbox()
  const [{ exercises }, { templates }, history] = await Promise.all([
    api<{ exercises: Exercise[] }>('/exercises'),
    api<{ templates: Template[] }>('/templates'),
    api<HistoryResponse>('/sessions/history'),
  ])

  await db.transaction('rw', [db.exercises, db.templates, db.bests, db.lastPerformance], async () => {
    await Promise.all([db.exercises.clear(), db.templates.clear(), db.bests.clear(), db.lastPerformance.clear()])
    await db.exercises.bulkPut(exercises)
    await db.templates.bulkPut(templates)
    await db.bests.bulkPut(history.records)
    await db.lastPerformance.bulkPut(lastPerformanceFrom(history))
  })
}

export function startBackgroundSync() {
  const run = () => refreshCache().catch(() => {})
  run()
  window.addEventListener('online', run)
  return () => window.removeEventListener('online', run)
}
