import { Link, useNavigate, useParams } from 'react-router'
import { MacroBars } from '../../components/MacroBars'
import { meals, round, sum, type FoodLog } from '../../lib/diet'
import { objectiveLabels, todayIso } from '../../lib/nutrition'
import type { Goal } from '../../lib/types'
import { Loading, Offline, useApi } from '../../lib/useApi'
import { formatKg } from '../../lib/workout'
import { BodyChart } from '../progress/BodyTab'
import { SessionCard } from '../progress/HistoryTab'
import type { MemberOverview } from './types'

function SharedDiet({ base }: { base: string }) {
  const { data, error } = useApi<{ logs: FoodLog[]; goal: Goal | null }>(`${base}/diet/${todayIso()}`)
  if (error) return null
  if (!data) return <Loading />
  return (
    <section className="grid gap-3">
      <h2 className="font-semibold">Dieta de hoje</h2>
      <MacroBars total={sum(data.logs)} goal={data.goal} />
      {meals.map(({ key, label }) => {
        const logs = data.logs.filter((l) => l.meal === key)
        if (logs.length === 0) return null
        return (
          <div key={key} className="text-sm">
            <p className="text-zinc-400">{label} · {round(sum(logs).kcal)} kcal</p>
            <p className="text-zinc-500">{logs.map((l) => `${l.foodName} (${l.grams}g)`).join(', ')}</p>
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
    <main className="mx-auto grid max-w-md gap-4 px-5 py-8">
      <button onClick={() => navigate('/dupla')} className="justify-self-start text-zinc-400">Voltar</button>
      {error && <Offline />}
      {!data && !error && <Loading />}
      {data && (
        <>
          <h1 className="text-2xl font-bold">{data.user.name}</h1>

          {data.goal && (
            <section className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-zinc-900 p-3"><p className="text-xs text-zinc-500">Objetivo</p><p className="font-semibold">{objectiveLabels[data.goal.objective]}</p></div>
              <div className="rounded-xl bg-zinc-900 p-3"><p className="text-xs text-zinc-500">Peso</p><p className="font-semibold">{lastWeight ? `${formatKg(lastWeight)} kg` : '—'}</p></div>
              <div className="rounded-xl bg-zinc-900 p-3"><p className="text-xs text-zinc-500">Meta</p><p className="font-semibold text-lime-400">{data.goal.targetWeightKg ? `${formatKg(data.goal.targetWeightKg)} kg` : '—'}</p></div>
            </section>
          )}

          {data.body.length > 0 && (
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
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
