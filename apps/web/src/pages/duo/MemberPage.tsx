import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { MacroBars } from '../../components/MacroBars'
import { foodLabel, round, shiftDate, sum, type FoodLog, type Meal } from '../../lib/diet'
import { objectiveLabels, todayIso } from '../../lib/nutrition'
import type { Goal } from '../../lib/types'
import { Loading, Offline, useApi } from '../../lib/useApi'
import { formatKg } from '../../lib/workout'
import { BodyChart } from '../progress/BodyTab'
import { SessionCard } from '../progress/HistoryTab'
import type { MemberOverview } from './types'

function dietDayLabel(iso: string) {
  const today = todayIso()
  if (iso === today) return 'Hoje'
  if (iso === shiftDate(today, -1)) return 'Ontem'
  return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
}

function SharedDiet({ base }: { base: string }) {
  const [date, setDate] = useState(todayIso())
  const { data, error } = useApi<{ logs: FoodLog[]; goal: Goal | null; meals: Meal[] }>(`${base}/diet/${date}`)
  return (
    <section className="grid gap-3">
      <h2 className="font-semibold">Dieta</h2>
      <div className="flex items-center justify-between rounded-xl bg-zinc-900 px-2 py-1">
        <button onClick={() => setDate((d) => shiftDate(d, -1))} className="px-4 py-2 text-zinc-400">‹</button>
        <button onClick={() => setDate(todayIso())} className="font-semibold">{dietDayLabel(date)}</button>
        <button onClick={() => setDate((d) => shiftDate(d, 1))} disabled={date >= todayIso()} className="px-4 py-2 text-zinc-400 disabled:opacity-20">›</button>
      </div>
      {error && <Offline />}
      {!data && !error && <Loading />}
      {data && <MacroBars total={sum(data.logs)} goal={data.goal} />}
      {data && data.logs.length === 0 && <p className="py-2 text-center text-sm text-zinc-600">Nada registrado nesse dia.</p>}
      {data && data.meals.map((meal) => {
        const logs = data.logs.filter((l) => l.mealId === meal.id)
        if (logs.length === 0) return null
        return (
          <div key={meal.id} className="text-sm">
            <p className="text-zinc-400">{meal.name} · {round(sum(logs).kcal)} kcal</p>
            <p className="text-zinc-500">{logs.map((l) => `${foodLabel(l.foodName)} (${l.grams}g)`).join(', ')}</p>
          </div>
        )
      })}
    </section>
  )
}

export function MemberPage() {
  const { campaignId, userId } = useParams()
  const navigate = useNavigate()
  const base = `/campaigns/${campaignId}/members/${userId}`
  const { data, error } = useApi<MemberOverview>(base)
  const lastWeight = data?.body.filter((b) => b.weightKg !== null).at(-1)?.weightKg

  return (
    <main className="mx-auto grid max-w-md gap-5 px-4 py-6 sm:px-6 lg:max-w-3xl lg:px-12 lg:py-10">
      <button onClick={() => navigate('/dupla')} className="justify-self-start text-zinc-400">Voltar</button>
      {error && <Offline />}
      {!data && !error && <Loading />}
      {data && (
        <>
          <h1 className="num text-4xl leading-none font-bold uppercase lg:text-5xl">{data.user.name}</h1>

          {data.goal && (
            <section className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-zinc-900 p-3"><p className="text-xs text-zinc-500">Objetivo</p><p className="font-semibold">{objectiveLabels[data.goal.objective]}</p></div>
              <div className="rounded-xl bg-zinc-900 p-3"><p className="text-xs text-zinc-500">Peso</p><p className="font-semibold">{lastWeight ? `${formatKg(lastWeight)} kg` : '—'}</p></div>
              <div className="rounded-xl bg-zinc-900 p-3"><p className="text-xs text-zinc-500">Meta</p><p className="font-semibold text-lime-400">{data.goal.targetWeightKg ? `${formatKg(data.goal.targetWeightKg)} kg` : '—'}</p></div>
            </section>
          )}

          {data.body.length > 0 && (
            <section className="card p-4">
              <BodyChart logs={data.body} target={data.goal?.targetWeightKg ?? null} />
            </section>
          )}

          <section className="grid gap-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Treinos recentes</h2>
              <Link to={`/dupla/${campaignId}/${userId}/recordes`} className="text-sm text-lime-400">Recordes</Link>
            </div>
            {data.sessions.map((s) => <SessionCard key={s.id} session={s} to={`/dupla/${campaignId}/${userId}/treino/${s.id}`} />)}
            {data.sessions.length === 0 && <p className="text-sm text-zinc-500">Nenhum treino ainda.</p>}
          </section>

          {data.sharesDiet ? <SharedDiet base={base} /> : <p className="text-center text-sm text-zinc-600">A dieta de {data.user.name} é privada.</p>}
        </>
      )}
    </main>
  )
}
