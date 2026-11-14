import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/Icon'
import { db } from '../../lib/db'
import { Loading, Offline, useApi } from '../../lib/useApi'
import { formatKg, muscleLabels, recordLabels, type Muscle, type RecordKind } from '../../lib/workout'
import { ExerciseDetail } from './ExerciseDetail'
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

const normalize = (v: string) => v.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function RecordLine({ record, who }: { record: RecentRecord; who?: string }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 border-b border-[#232327] py-2 text-sm last:border-0">
      <div className="flex items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-pr/16 text-purple-300"><Icon name="trophy" size={16} /></span>
        <div>
          <p className="font-semibold">{who && <span className="text-lime-400">{who} · </span>}{record.exerciseName}</p>
          <p className="text-xs text-muted">{recordLabels[record.kind]} · {formatDay(record.achievedAt)}</p>
        </div>
      </div>
      <p className="num shrink-0 text-lg font-semibold">{formatKg(record.weightKg)} kg × {record.reps}</p>
    </div>
  )
}

export function RecordsTab({ basePath = '/progress', linkBase = '/progresso/exercicio' }: { basePath?: string; linkBase?: string }) {
  const { data, error } = useApi<{ bests: ExerciseBest[]; records: RecentRecord[] }>(`${basePath}/exercises`)
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [])
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  if (error) return <Offline />
  if (!data) return <Loading />
  if (data.bests.length === 0) return <p className="py-10 text-center text-zinc-500">Faça alguns treinos para ver os recordes.</p>

  const current = selected ?? data.bests[0].exerciseId
  const currentBest = data.bests.find((b) => b.exerciseId === current)
  const list = data.bests.filter((b) => normalize(b.name).includes(normalize(filter)))

  return (
    <div className="grid gap-5">
      {data.records.length > 0 && (
        <section className="card px-5 py-3">
          <h2 className="label-caps pt-1 pb-1">PRs recentes</h2>
          {data.records.slice(0, 5).map((r) => <RecordLine key={r.id} record={r} />)}
        </section>
      )}

      <div className="flex flex-wrap items-start gap-5">
        <section aria-label="Exercícios" className="card min-w-0 flex-[1_1_300px] p-2">
          <label className="relative m-2 flex">
            <span className="absolute top-3.5 left-3 text-muted"><Icon name="search" size={18} /></span>
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrar exercícios"
              className="h-11 flex-1 rounded-xl border border-line-strong bg-surface-2 pr-3 pl-9.5 text-sm outline-none focus:border-lime-400"
            />
          </label>
          <ul className="flex flex-col gap-0.5">
            {list.map((b) => {
              const inner = (
                <>
                  <span className="flex flex-col text-left"><span className="text-sm font-semibold">{b.name}</span><span className="text-xs text-muted">{muscleLabels[b.primaryMuscle]} · {b.sessions} treino(s)</span></span>
                  <span className="num text-lg font-semibold text-lime-400">{formatKg(b.bestE1rm)}</span>
                </>
              )
              const cls = `flex min-h-14 w-full items-center justify-between rounded-xl px-3 ${b.exerciseId === current ? 'lg:bg-lime-400/10' : ''}`
              return (
                <li key={b.exerciseId}>
                  <Link to={`${linkBase}/${b.exerciseId}`} className={`${cls} lg:hidden`}>{inner}</Link>
                  <button onClick={() => setSelected(b.exerciseId)} className={`${cls} hidden lg:flex`}>{inner}</button>
                </li>
              )
            })}
          </ul>
        </section>

        <div className="hidden min-w-0 flex-[999_1_520px] lg:block">
          <ExerciseDetail
            key={current}
            exerciseId={current}
            basePath={basePath}
            exercise={exercises.find((e) => e.id === current)}
            fallbackName={currentBest?.name}
          />
        </div>
      </div>
    </div>
  )
}
