import { Link } from 'react-router'
import { Loading, Offline, useApi } from '../../lib/useApi'
import { formatKg, muscleLabels, recordLabels, type Muscle, type RecordKind } from '../../lib/workout'
import { formatDay } from './HistoryTab'

export type RecentRecord = {
  id: string
  userId: string
  exerciseId: string
  exerciseName: string
  kind: RecordKind
  value: number
  weightKg: number
  reps: number
  achievedAt: string
}

export type ExerciseBest = {
  exerciseId: string
  name: string
  primaryMuscle: Muscle
  maxWeight: number
  bestE1rm: number
  sessions: number
  lastDone: string
  lastRecordAt: string | null
}

export function RecordLine({ record, who }: { record: RecentRecord; who?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-zinc-900 py-2 text-sm last:border-0">
      <div>
        <p className="font-medium">{who && <span className="text-lime-400">{who} · </span>}{record.exerciseName}</p>
        <p className="text-xs text-zinc-500">{recordLabels[record.kind]} · {formatDay(record.achievedAt)}</p>
      </div>
      <p className="shrink-0 font-semibold">{formatKg(record.weightKg)} kg × {record.reps}</p>
    </div>
  )
}

export function RecordsTab({ basePath = '/progress', linkBase = '/progresso/exercicio' }: { basePath?: string; linkBase?: string }) {
  const { data, error } = useApi<{ bests: ExerciseBest[]; records: RecentRecord[] }>(`${basePath}/exercises`)

  if (error) return <Offline />
  if (!data) return <Loading />
  if (data.bests.length === 0) return <p className="py-10 text-center text-zinc-500">Faça alguns treinos para ver seus recordes.</p>

  return (
    <div className="grid gap-4">
      {data.records.length > 0 && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="mb-1 font-semibold">🏆 PRs recentes</h2>
          {data.records.map((r) => <RecordLine key={r.id} record={r} />)}
        </section>
      )}

      <section className="grid gap-2">
        <h2 className="font-semibold">Por exercício</h2>
        {data.bests.map((b) => (
          <Link
            key={b.exerciseId}
            to={`${linkBase}/${b.exerciseId}`}
            className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3"
          >
            <div>
              <p className="font-medium">{b.name}</p>
              <p className="text-xs text-zinc-500">{muscleLabels[b.primaryMuscle]} · {b.sessions} treino(s)</p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{formatKg(b.maxWeight)} kg</p>
              <p className="text-xs text-zinc-500">1RM ~{formatKg(b.bestE1rm)}</p>
            </div>
          </Link>
        ))}
      </section>
    </div>
  )
}
