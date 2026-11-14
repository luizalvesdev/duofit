import { useState } from 'react'
import { Link } from 'react-router'
import { FoodSearch } from '../../components/FoodSearch'
import { MacroBars } from '../../components/MacroBars'
import { NumericInput } from '../../components/NumericInput'
import { api } from '../../lib/api'
import { forGrams, meals, round, shiftDate, sum, type DayResponse, type FoodLog, type Meal, type PlanItem } from '../../lib/diet'
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
          <button onClick={save} className="rounded-lg bg-lime-400 px-3 py-2 text-sm font-semibold text-zinc-950">Salvar</button>
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

  async function log(meal: Meal, foodId: string, grams: number, planItemId: string | null = null) {
    await api('/diet/logs', { method: 'POST', body: { loggedOn: date, meal, foodId, grams, planItemId } })
    reload()
  }

  async function eatWholeMeal(items: PlanItem[]) {
    for (const item of items) await api('/diet/logs', { method: 'POST', body: { loggedOn: date, meal: item.meal, foodId: item.food.id, grams: item.grams, planItemId: item.id } })
    reload()
  }

  const total = sum(data?.logs ?? [])

  return (
    <main className="mx-auto grid max-w-md gap-4 px-5 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dieta</h1>
        <Link to="/dieta/plano" className="text-sm text-lime-400">Meu plano</Link>
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

          {meals.map(({ key, label }) => {
            const logs = data.logs.filter((l) => l.meal === key)
            const eaten = new Set(logs.map((l) => l.planItemId))
            const pending = data.plan.filter((p) => p.meal === key && !eaten.has(p.id))
            const mealKcal = round(sum(logs).kcal)
            if (logs.length === 0 && pending.length === 0 && key === 'supper') {
              return (
                <button key={key} onClick={() => setAdding(key)} className="text-sm text-zinc-500">+ Ceia</button>
              )
            }
            return (
              <section key={key} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="mb-1 flex items-center justify-between">
                  <h2 className="font-semibold">{label}</h2>
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
                    {pending.map((p) => <PlanRow key={p.id} item={p} onEat={(item) => log(key, item.food.id, item.grams, item.id)} />)}
                  </div>
                )}
                <button onClick={() => setAdding(key)} className="mt-2 text-sm text-lime-400">+ Adicionar</button>
              </section>
            )
          })}
        </>
      )}

      {adding && (
        <FoodSearch
          title={meals.find((m) => m.key === adding)!.label}
          onClose={() => setAdding(null)}
          onAdd={async (food, grams) => {
            await log(adding, food.id, grams)
            setAdding(null)
          }}
        />
      )}
    </main>
  )
}
