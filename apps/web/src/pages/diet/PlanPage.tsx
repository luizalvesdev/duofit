import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { FoodSearch } from '../../components/FoodSearch'
import { MacroBars } from '../../components/MacroBars'
import { NumericInput } from '../../components/NumericInput'
import { Button, ErrorText } from '../../components/ui'
import { api } from '../../lib/api'
import { forGrams, meals, round, sum, type Food, type Meal, type PlanItem } from '../../lib/diet'
import type { ProfileResponse } from '../../lib/types'
import { Loading, useApi } from '../../lib/useApi'

type Draft = { key: string; meal: Meal; food: Food; grams: number | null }

export function PlanPage() {
  const navigate = useNavigate()
  const plan = useApi<{ plan: PlanItem[] }>('/diet/plan')
  const profile = useApi<ProfileResponse>('/profile')
  const [items, setItems] = useState<Draft[] | null>(null)
  const [adding, setAdding] = useState<Meal | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (plan.data && items === null) {
      setItems(plan.data.plan.map((p) => ({ key: p.id, meal: p.meal, food: p.food, grams: p.grams })))
    }
  }, [plan.data, items])

  if (!items) return <main className="mx-auto max-w-md px-5 py-8">{plan.error ? 'Sem conexão.' : <Loading />}</main>

  const total = sum(items.filter((i) => i.grams).map((i) => forGrams(i.food, i.grams!)))

  async function save() {
    if (items!.some((i) => !i.grams)) return setError('Preencha a quantidade de todos os itens.')
    setSaving(true)
    try {
      await api('/diet/plan', { method: 'PUT', body: { items: items!.map((i) => ({ meal: i.meal, foodId: i.food.id, grams: i.grams })) } })
      navigate('/dieta')
    } catch {
      setError('Não foi possível salvar.')
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto grid max-w-md gap-5 px-4 py-6 sm:px-6 lg:max-w-3xl lg:px-12 lg:py-10">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate('/dieta')} className="text-zinc-400">Voltar</button>
        <h1 className="text-lg font-bold">Meu plano</h1>
        <span className="w-12" />
      </header>
      <p className="text-sm text-zinc-500">O cardápio base do dia. No diário, cada item aparece com o botão "Comi".</p>

      <MacroBars total={total} goal={profile.data?.goal ?? null} />

      {meals.map(({ key, label }) => (
        <section key={key} className="card p-4">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-semibold">{label}</h2>
            <span className="text-sm text-zinc-500">
              {round(sum(items.filter((i) => i.meal === key && i.grams).map((i) => forGrams(i.food, i.grams!))).kcal) || ''}
            </span>
          </div>
          {items.filter((i) => i.meal === key).map((item) => (
            <div key={item.key} className="flex items-center gap-2 border-b border-zinc-900 py-2 text-sm last:border-0">
              <span className="flex-1">{item.food.name}</span>
              <div className="w-20"><NumericInput decimal value={item.grams} onCommit={(g) => setItems((prev) => prev!.map((i) => (i.key === item.key ? { ...i, grams: g } : i)))} /></div>
              <span className="text-zinc-500">g</span>
              <button onClick={() => setItems((prev) => prev!.filter((i) => i.key !== item.key))} className="px-1 text-zinc-600">✕</button>
            </div>
          ))}
          <button onClick={() => setAdding(key)} className="mt-2 text-sm text-lime-400">+ Adicionar</button>
        </section>
      ))}

      <ErrorText>{error}</ErrorText>
      <Button onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar plano'}</Button>

      {adding && (
        <FoodSearch
          title={meals.find((m) => m.key === adding)!.label}
          onClose={() => setAdding(null)}
          onAdd={(food, grams) => {
            setItems((prev) => [...prev!, { key: crypto.randomUUID(), meal: adding, food, grams }])
            setAdding(null)
          }}
        />
      )}
    </main>
  )
}
