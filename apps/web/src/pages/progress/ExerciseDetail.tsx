import { LineChart } from '../../components/LineChart'
import { Loading, Offline, useApi } from '../../lib/useApi'
import { equipmentLabels, formatKg, muscleLabels, type Exercise } from '../../lib/workout'
import { formatDay } from './HistoryTab'

type Point = { sessionId: string; date: string; maxWeight: number; bestE1rm: number; volume: number; sets: number }

const EIGHT_WEEKS = 56 * 86_400_000

export function ExerciseDetail({ exerciseId, basePath, exercise, fallbackName }: {
  exerciseId: string
  basePath: string
  exercise?: Exercise
  fallbackName?: string
}) {
  const { data, error } = useApi<{ points: Point[] }>(`${basePath}/exercises/${exerciseId}`)
  const points = data?.points ?? []
  const toXY = (key: 'maxWeight' | 'bestE1rm') => points.map((p) => ({ x: new Date(p.date).getTime(), y: p[key] }))
  const maxWeight = Math.max(0, ...points.map((p) => p.maxWeight))
  const bestE1rm = Math.max(0, ...points.map((p) => p.bestE1rm))
  const recent = points.filter((p) => Date.now() - new Date(p.date).getTime() <= EIGHT_WEEKS)
  const change = recent.length >= 2 ? ((recent.at(-1)!.bestE1rm - recent[0].bestE1rm) / recent[0].bestE1rm) * 100 : null

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          {exercise && <span className="text-[13px] text-zinc-400">{muscleLabels[exercise.primaryMuscle]} · {equipmentLabels[exercise.equipment]}</span>}
          <h2 className="num text-3xl leading-none font-bold lg:text-4xl">{exercise?.name ?? fallbackName ?? 'Exercício'}</h2>
        </div>
        {points.length > 0 && (
          <div className="flex gap-6">
            <span className="flex flex-col"><span className="text-xs text-zinc-400">Maior carga</span><span className="num text-[32px] leading-none font-bold">{formatKg(maxWeight)}<span className="text-sm text-zinc-400"> kg</span></span></span>
            <span className="flex flex-col"><span className="text-xs text-zinc-400">1RM estimado</span><span className="num text-[32px] leading-none font-bold text-lime-400">{formatKg(bestE1rm)}<span className="text-sm text-zinc-400"> kg</span></span></span>
            {change !== null && (
              <span className="flex flex-col"><span className="text-xs text-zinc-400">Em 8 semanas</span><span className="num text-[32px] leading-none font-bold">{change >= 0 ? '+' : ''}{Math.round(change)}%</span></span>
            )}
          </div>
        )}
      </div>

      {error && <Offline />}
      {!data && !error && <Loading />}
      {data && (
        <>
          <figure className="card m-0 p-5">
            <LineChart
              unit=" kg"
              series={[
                { label: '1RM estimado', color: '#a3e635', points: toXY('bestE1rm'), dots: true },
                { label: 'Maior carga', color: '#a1a1aa', points: toXY('maxWeight') },
              ]}
            />
          </figure>
          <div className="card px-4 py-1">
            {[...points].reverse().map((p) => (
              <div key={p.sessionId} className="flex justify-between gap-3 border-b border-[#232327] py-3 text-sm last:border-0">
                <span className="text-zinc-400">{formatDay(p.date)}</span>
                <span className="num text-[17px]">
                  <b>{formatKg(p.maxWeight)} kg</b> <span className="text-muted">· 1RM</span> <b className="text-lime-400">{formatKg(p.bestE1rm)}</b> <span className="text-muted">· {Math.round(p.volume).toLocaleString('pt-BR')} kg vol.</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
