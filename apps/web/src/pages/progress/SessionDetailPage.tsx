import { useNavigate, useParams } from 'react-router'
import { Loading, Offline, useApi } from '../../lib/useApi'
import { formatDuration, formatKg, recordLabels, setTypeInfo, type RecordKind, type SetType } from '../../lib/workout'
import { formatDay } from './HistoryTab'

type Detail = {
  session: { name: string; startedAt: string; durationSeconds: number }
  sets: { id: string; exerciseId: string; exerciseName: string; exercisePosition: number; setType: SetType; weightKg: number; reps: number }[]
  records: { setId: string; kind: RecordKind }[]
}

export function SessionDetailPage({ basePath = '/progress' }: { basePath?: string }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, error } = useApi<Detail>(`${basePath}/sessions/${id}`)

  const groups = new Map<number, Detail['sets']>()
  for (const set of data?.sets ?? []) groups.set(set.exercisePosition, [...(groups.get(set.exercisePosition) ?? []), set])

  return (
    <main className="mx-auto grid max-w-md gap-4 px-5 py-8">
      <button onClick={() => navigate(-1)} className="justify-self-start text-zinc-400">Voltar</button>
      {error && <Offline />}
      {!data && !error && <Loading />}
      {data && (
        <>
          <header>
            <h1 className="text-2xl font-bold">{data.session.name}</h1>
            <p className="text-zinc-500">{formatDay(data.session.startedAt)} · {formatDuration(data.session.durationSeconds)}</p>
          </header>
          {[...groups.values()].map((sets) => {
            let n = 0
            return (
              <section key={sets[0].exercisePosition} className="grid gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
                <h2 className="font-semibold">{sets[0].exerciseName}</h2>
                {sets.map((set) => {
                  if (set.setType !== 'warmup') n++
                  const info = setTypeInfo[set.setType]
                  const prs = data.records.filter((r) => r.setId === set.id)
                  return (
                    <div key={set.id} className="flex items-center gap-3 text-sm">
                      <span className={`w-6 text-center font-bold ${info.className}`}>{info.short || n}</span>
                      <span className="flex-1">{formatKg(set.weightKg)} kg × {set.reps}</span>
                      {prs.length > 0 && <span className="text-xs text-lime-400">🏆 {prs.map((r) => recordLabels[r.kind]).join(', ')}</span>}
                    </div>
                  )
                })}
              </section>
            )
          })}
        </>
      )}
    </main>
  )
}
