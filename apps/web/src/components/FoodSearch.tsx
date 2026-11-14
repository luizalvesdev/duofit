import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { forGrams, round, type Food } from '../lib/diet'
import { NumericInput } from './NumericInput'
import { Button, ErrorText, Field, Input } from './ui'

function MacroLine({ food, grams }: { food: Food; grams: number }) {
  const m = forGrams(food, grams)
  return (
    <p className="text-sm text-zinc-400">
      <b className="text-zinc-100">{round(m.kcal)} kcal</b> · P {round(m.protein)}g · C {round(m.carbs)}g · G {round(m.fat)}g
    </p>
  )
}

function CreateFood({ initialName, onCreated, onCancel }: { initialName: string; onCreated: (food: Food) => void; onCancel: () => void }) {
  const [name, setName] = useState(initialName)
  const [portion, setPortion] = useState<number | null>(null)
  const [values, setValues] = useState<Record<'kcal' | 'protein' | 'carbs' | 'fat', number | null>>({ kcal: null, protein: null, carbs: null, fat: null })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (name.trim().length < 2 || !portion || Object.values(values).some((v) => v === null)) {
      return setError('Preencha nome, porção e os 4 valores do rótulo.')
    }
    const per100 = (v: number) => Math.round((v / portion) * 1000) / 10
    setSaving(true)
    try {
      const { food } = await api<{ food: Food }>('/diet/foods', {
        method: 'POST',
        body: {
          name,
          kcal: per100(values.kcal!),
          protein: per100(values.protein!),
          carbs: per100(values.carbs!),
          fat: per100(values.fat!),
          servingName: `1 porção (${portion}g)`,
          servingGrams: portion,
        },
      })
      onCreated(food)
    } catch {
      setError('Não foi possível salvar. Confira os valores.')
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4 p-4">
      <h2 className="text-lg font-semibold">Novo alimento</h2>
      <p className="text-sm text-zinc-500">Copie da tabela nutricional da embalagem.</p>
      <Field label="Nome">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
      </Field>
      <Field label="Porção do rótulo (g ou ml)">
        <NumericInput decimal value={portion} onCommit={setPortion} placeholder="30" />
      </Field>
      <div className="grid grid-cols-4 gap-2">
        {([['kcal', 'Kcal'], ['protein', 'Prot.'], ['carbs', 'Carbo'], ['fat', 'Gord.']] as const).map(([key, label]) => (
          <label key={key} className="grid gap-1 text-center">
            <span className="text-xs text-zinc-500">{label}</span>
            <NumericInput decimal value={values[key]} onCommit={(v) => setValues((prev) => ({ ...prev, [key]: v }))} />
          </label>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      <Button onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar alimento'}</Button>
      <button onClick={onCancel} className="text-sm text-zinc-500">Cancelar</button>
    </div>
  )
}

export function FoodSearch({ title, onAdd, onClose }: { title: string; onAdd: (food: Food, grams: number) => Promise<void> | void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Food[] | null>(null)
  const [recent, setRecent] = useState<Food[]>([])
  const [selected, setSelected] = useState<Food | null>(null)
  const [grams, setGrams] = useState<number | null>(100)
  const [creating, setCreating] = useState(false)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    api<{ foods: Food[] }>('/diet/foods/recent').then((r) => setRecent(r.foods)).catch(() => {})
  }, [])

  useEffect(() => {
    if (query.trim().length < 2) return setResults(null)
    const timer = setTimeout(() => {
      api<{ foods: Food[] }>(`/diet/foods?q=${encodeURIComponent(query)}`).then((r) => setResults(r.foods)).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  const pick = (food: Food) => {
    setSelected(food)
    setGrams(food.lastGrams ?? food.servingGrams ?? 100)
  }

  async function confirm() {
    if (!selected || !grams) return
    setAdding(true)
    await onAdd(selected, grams)
    setAdding(false)
  }

  const list = results ?? recent

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-zinc-950">
      {creating ? (
        <CreateFood initialName={query} onCancel={() => setCreating(false)} onCreated={(food) => { setCreating(false); pick(food) }} />
      ) : selected ? (
        <div className="grid gap-4 p-4">
          <button onClick={() => setSelected(null)} className="justify-self-start text-zinc-400">Voltar</button>
          <h2 className="text-lg font-semibold">{selected.name}</h2>
          <Field label="Quantidade (g)">
            <NumericInput decimal value={grams} onCommit={setGrams} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {[...(selected.servingGrams ? [selected.servingGrams] : []), 50, 100, 150, 200].map((g) => (
              <button key={g} onClick={() => setGrams(g)} className="rounded-full border border-zinc-700 px-3 py-1 text-sm text-zinc-300">
                {g === selected.servingGrams ? selected.servingName : `${g}g`}
              </button>
            ))}
          </div>
          {grams ? <MacroLine food={selected} grams={grams} /> : null}
          <Button onClick={confirm} disabled={!grams || adding}>{adding ? 'Adicionando…' : `Adicionar em ${title}`}</Button>
        </div>
      ) : (
        <>
          <header className="flex items-center gap-3 border-b border-zinc-900 p-4">
            <button onClick={onClose} className="text-zinc-400">Fechar</button>
            <Input autoFocus placeholder="Buscar alimento (ex: frango grelhado)" value={query} onChange={(e) => setQuery(e.target.value)} />
          </header>
          <ul className="flex-1 px-4 pb-8">
            {!results && recent.length > 0 && <li className="pt-3 text-xs uppercase tracking-wide text-zinc-600">Recentes</li>}
            {list.map((food) => (
              <li key={food.id}>
                <button onClick={() => pick(food)} className="w-full border-b border-zinc-900 py-3 text-left">
                  <p className="font-medium">{food.name}</p>
                  <p className="text-xs text-zinc-500">
                    {round(food.kcal)} kcal · P {food.protein} · C {food.carbs} · G {food.fat} por 100g
                    {food.source === 'custom' && ' · seu'}
                  </p>
                </button>
              </li>
            ))}
            {results?.length === 0 && <li className="py-6 text-center text-zinc-500">Nada encontrado.</li>}
            <li>
              <button onClick={() => setCreating(true)} className="w-full py-4 text-center text-lime-400">+ Cadastrar alimento da embalagem</button>
            </li>
          </ul>
        </>
      )}
    </div>
  )
}
