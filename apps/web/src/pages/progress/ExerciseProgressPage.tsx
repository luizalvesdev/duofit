import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router'
import { LineChart } from '../../components/LineChart'
import { db } from '../../lib/db'
import { Loading, Offline, useApi } from '../../lib/useApi'
import { formatKg } from '../../lib/workout'
import { formatDay } from './HistoryTab'

type Point = { sessionId: string; date: string; maxWeight: number; bestE1rm: number; volume: number; sets: number }

export function ExerciseProgressPage({ basePath = '/progress' }: { basePath?: string }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const exercise = useLiveQuery(() => db.exercises.get(id!), [id])
  const { data, error } = useApi<{ points: Point[] }>(`${basePath}/exercises/${id}`)
  const points = data?.points ?? []
  const toXY = (key: 'maxWeight' | 'bestE1rm') => points.map((p) => ({ x: new Date(p.date).getTime(), y: p[key] }))

  return (
    <main className="mx-auto grid max-w-md gap-4 px-5 py-8">
      <button onClick={() => navigate(-1)} className="justify-self-start text-zinc-400">Voltar</button>
      <h1 className="text-2xl font-bold">{exercise?.name ?? 'Exercício'}</h1>
      {error && <Offline />}
      {!data && !error && <Loading />}
      {data && (
        <>
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
            <LineChart
              unit=" kg"
              series={[
                { label: '1RM estimado', color: '#a3e635', points: toXY('bestE1rm'), dots: true },
                { label: 'Maior carga', color: '#38bdf8', points: toXY('maxWeight'), dots: true },
              ]}
            />
          </section>
          <section className="grid gap-1">
            {[...points].reverse().map((p) => (
              <div key={p.sessionId} className="flex justify-between border-b border-zinc-900 py-2 text-sm">
                <span className="text-zinc-400">{formatDay(p.date)}</span>
                <span>{formatKg(p.maxWeight)} kg · 1RM ~{formatKg(p.bestE1rm)} · {Math.round(p.volume).toLocaleString('pt-BR')} kg vol.</span>
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  )
}
