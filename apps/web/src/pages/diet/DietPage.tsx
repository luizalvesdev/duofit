import { useState } from 'react'
import { Link } from 'react-router'
import { FoodSearch } from '../../components/FoodSearch'
import { MacroBars } from '../../components/MacroBars'
import { NumericInput } from '../../components/NumericInput'
import { api } from '../../lib/api'
import { forGrams, round, shiftDate, sum, type DayResponse, type FoodLog, type Meal, type PlanItem } from '../../lib/diet'
import { todayIso } from '../../lib/nutrition'
import { Loading, Offline, useApi } from '../../lib/useApi'

function dayLabel(iso: string) {
  const today = todayIso()
  if (iso === today) return 'Hoje'
  if (iso === shiftDate(today, -1)) return 'Ontem'
  return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
}

function LogRow({ log, onChange }: { log: FoodLog; onChange: () => void }) {
  const [editing, setEditing] = useState(false)
  const [grams, setGrams] = useState<number | null>(log.grams)

  async function save() {
    if (grams && grams !== log.grams) await api(`/diet/logs/${log.id}`, { method: 'PATCH', body: { grams } })
    setEditing(false)
    onChange()
  }

  async function remove() {
    await api(`/diet/logs/${log.id}`, { method: 'DELETE' })
    onChange()
  }

  return (
    <div className="border-b border-zinc-900 py-2 last:border-0">
      <button onClick={() => setEditing((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left text-sm">
        <span className="flex-1">{log.foodName} <span className="text-zinc-500">· {log.grams}g</span></span>
        <span className="text-zinc-300">{round(log.kcal)} kcal</span>
      </button>
      {editing && (
        <div className="mt-2 flex items-center gap-2">
          <div className="w-24"><NumericInput decimal value={grams} onCommit={setGrams} /></div>
          <span className="text-sm text-zinc-500">g</span>
          <button onClick={save} className="rounded-lg bg-lime-400 px-3 py-2 text-sm font-semibold text-ink">Salvar</button>
          <button onClick={remove} className="ml-auto text-sm text-red-400">Excluir</button>
        </div>
      )}
    </div>
  )
}

function PlanRow({ item, onEat }: { item: PlanItem; onEat: (item: PlanItem) => void }) {
  const kcal = round(forGrams(item.food, item.grams).kcal)
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed border-zinc-800 py-2 text-sm text-zinc-500 last:border-0">
      <span className="flex-1">{item.food.name} · {item.grams}g · {kcal} kcal</span>
      <button onClick={() => onEat(item)} className="rounded-lg border border-lime-400/50 px-3 py-1 text-xs font-semibold text-lime-400">Comi</button>
    </div>
  )
}

export function DietPage() {
  const [date, setDate] = useState(todayIso())
  const { data, error, reload } = useApi<DayResponse>(`/diet/day/${date}`)
  const [adding, setAdding] = useState<Meal | null>(null)

  async function log(mealId: string, foodId: string, grams: number, planItemId: string | null = null) {
    await api('/diet/logs', { method: 'POST', body: { loggedOn: date, mealId, foodId, grams, planItemId } })
    reload()
  }

  async function eatWholeMeal(items: PlanItem[]) {
    for (const item of items) await api('/diet/logs', { method: 'POST', body: { loggedOn: date, mealId: item.mealId, foodId: item.food.id, grams: item.grams, planItemId: item.id } })
    reload()
  }

  const total = sum(data?.logs ?? [])

  return (
    <main className="mx-auto grid max-w-md gap-5 px-4 py-6 sm:px-6 lg:max-w-3xl lg:px-12 lg:py-10">
      <header className="flex items-center justify-between">
        <h1 className="num text-4xl leading-none font-bold uppercase lg:text-5xl">Dieta</h1>
        <nav className="flex gap-4 text-sm text-lime-400">
          <Link to="/dieta/refeicoes">Refeições</Link>
          <Link to="/dieta/plano">Meu plano</Link>
        </nav>
      </header>

      <div className="flex items-center justify-between rounded-xl bg-zinc-900 px-2 py-1">
        <button onClick={() => setDate((d) => shiftDate(d, -1))} className="px-4 py-2 text-zinc-400">‹</button>
        <button onClick={() => setDate(todayIso())} className="font-semibold">{dayLabel(date)}</button>
        <button onClick={() => setDate((d) => shiftDate(d, 1))} disabled={date >= todayIso()} className="px-4 py-2 text-zinc-400 disabled:opacity-20">›</button>
      </div>

      {error && <Offline />}
      {!data && !error && <Loading />}
      {data && (
        <>
          <MacroBars total={total} goal={data.goal} />

          {data.meals.length === 0 && (
            <p className="text-center text-sm text-zinc-500">
              Nenhuma refeição. <Link to="/dieta/refeicoes" className="text-lime-400">Criar refeições</Link>
            </p>
          )}

          {data.meals.map((meal) => {
            const logs = data.logs.filter((l) => l.mealId === meal.id)
            const eaten = new Set(logs.map((l) => l.planItemId))
            const pending = data.plan.filter((p) => p.mealId === meal.id && !eaten.has(p.id))
            const mealKcal = round(sum(logs).kcal)
            return (
              <section key={meal.id} className="card p-4">
                <div className="mb-1 flex items-center justify-between">
                  <h2 className={`font-semibold ${meal.archived ? 'text-zinc-400' : ''}`}>{meal.name}</h2>
                  <span className="text-sm text-zinc-500">{mealKcal > 0 && `${mealKcal} kcal`}</span>
                </div>
                {logs.map((l) => <LogRow key={l.id} log={l} onChange={reload} />)}
                {pending.length > 0 && (
                  <div className="mt-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-wide text-zinc-600">Do plano</p>
                      {pending.length > 1 && (
                        <button onClick={() => eatWholeMeal(pending)} className="text-xs text-lime-400">Comi tudo</button>
                      )}
                    </div>
                    {pending.map((p) => <PlanRow key={p.id} item={p} onEat={(item) => log(meal.id, item.food.id, item.grams, item.id)} />)}
                  </div>
                )}
                {!meal.archived && (
                  <button onClick={() => setAdding(meal)} className="mt-2 text-sm text-lime-400">+ Adicionar</button>
                )}
              </section>
            )
          })}
        </>
      )}

      {adding && (
        <FoodSearch
          title={adding.name}
          onClose={() => setAdding(null)}
          onAdd={async (food, grams) => {
            await log(adding.id, food.id, grams)
            setAdding(null)
          }}
        />
      )}
    </main>
  )
}
