import { useState } from 'react'
import { LineChart } from '../../components/LineChart'
import { NumericInput } from '../../components/NumericInput'
import { Button } from '../../components/ui'
import { api } from '../../lib/api'
import { todayIso } from '../../lib/nutrition'
import type { ProfileResponse } from '../../lib/types'
import { Loading, Offline, useApi } from '../../lib/useApi'
import { formatKg } from '../../lib/workout'

export type BodyLog = {
  loggedOn: string
  weightKg: number | null
  waistCm: number | null
  hipCm: number | null
  armCm: number | null
  thighCm: number | null
}

const measures = [
  ['waistCm', 'Cintura'],
  ['hipCm', 'Quadril'],
  ['armCm', 'Braço'],
  ['thighCm', 'Coxa'],
] as const

const dayMs = (iso: string) => new Date(`${iso}T12:00:00`).getTime()

export function movingAverage(logs: BodyLog[], days = 7) {
  const weights = logs.filter((l) => l.weightKg !== null)
  return weights.map((log) => {
    const end = dayMs(log.loggedOn)
    const window = weights.filter((w) => dayMs(w.loggedOn) > end - days * 86_400_000 && dayMs(w.loggedOn) <= end)
    const avg = window.reduce((sum, w) => sum + w.weightKg!, 0) / window.length
    return { x: end, y: Math.round(avg * 10) / 10 }
  })
}

export function BodyChart({ logs, target }: { logs: BodyLog[]; target: number | null }) {
  const weights = logs.filter((l) => l.weightKg !== null)
  return (
    <LineChart
      unit=" kg"
      target={target}
      series={[
        { label: 'Média 7 dias', color: '#a3e635', points: movingAverage(logs) },
        { label: 'Pesagem', color: '#52525b', points: weights.map((l) => ({ x: dayMs(l.loggedOn), y: l.weightKg! })), dots: true },
      ]}
    />
  )
}

export function BodyTab() {
  const { data, error, reload } = useApi<{ logs: BodyLog[] }>('/progress/body')
  const profile = useApi<ProfileResponse>('/profile')
  const [form, setForm] = useState<Partial<Record<'weightKg' | (typeof measures)[number][0], number | null>>>({})
  const [showMeasures, setShowMeasures] = useState(false)
  const [saving, setSaving] = useState(false)

  if (error) return <Offline />
  if (!data) return <Loading />

  const logs = data.logs
  const today = logs.find((l) => l.loggedOn === todayIso())
  const target = profile.data?.goal?.targetWeightKg ?? null
  const average = movingAverage(logs)
  const lastAvg = average.at(-1)?.y
  const weekAgo = average.filter((p) => p.x <= Date.now() - 7 * 86_400_000).at(-1)?.y

  async function save() {
    const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== undefined))
    if (Object.keys(body).length === 0) return
    setSaving(true)
    await api('/progress/body', { method: 'PUT', body: { loggedOn: todayIso(), ...body } })
    setForm({})
    setSaving(false)
    reload()
  }

  async function remove(date: string) {
    if (!confirm('Apagar este registro?')) return
    await api(`/progress/body/${date}`, { method: 'DELETE' })
    reload()
  }

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 card p-4">
        <div className="flex items-end gap-3">
          <label className="grid flex-1 gap-1">
            <span className="text-sm text-zinc-400">Peso de hoje (kg)</span>
            <NumericInput
              decimal
              value={form.weightKg ?? null}
              placeholder={today?.weightKg ? formatKg(today.weightKg) : 'kg'}
              onCommit={(v) => setForm((f) => ({ ...f, weightKg: v }))}
            />
          </label>
          <Button onClick={save} disabled={saving}>{saving ? '…' : 'Salvar'}</Button>
        </div>
        <button onClick={() => setShowMeasures((v) => !v)} className="justify-self-start text-sm text-lime-400">
          {showMeasures ? 'Esconder medidas' : '+ Medidas (cm)'}
        </button>
        {showMeasures && (
          <div className="grid grid-cols-4 gap-2">
            {measures.map(([key, label]) => (
              <label key={key} className="grid gap-1 text-center">
                <span className="text-xs text-zinc-500">{label}</span>
                <NumericInput
                  decimal
                  value={form[key] ?? null}
                  placeholder={today?.[key] ? formatKg(today[key]!) : '—'}
                  onCommit={(v) => setForm((f) => ({ ...f, [key]: v }))}
                />
              </label>
            ))}
          </div>
        )}
      </section>

      {lastAvg !== undefined && (
        <section className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-zinc-900 p-3">
            <p className="text-xs text-zinc-500">Média 7d</p>
            <p className="text-lg font-bold">{formatKg(lastAvg)}</p>
          </div>
          <div className="rounded-xl bg-zinc-900 p-3">
            <p className="text-xs text-zinc-500">Na semana</p>
            <p className="text-lg font-bold">{weekAgo !== undefined ? `${lastAvg - weekAgo > 0 ? '+' : ''}${formatKg(Math.round((lastAvg - weekAgo) * 10) / 10)}` : '—'}</p>
          </div>
          <div className="rounded-xl bg-zinc-900 p-3">
            <p className="text-xs text-zinc-500">Falta</p>
            <p className="text-lg font-bold text-lime-400">{target ? formatKg(Math.round(Math.abs(lastAvg - target) * 10) / 10) : '—'}</p>
          </div>
        </section>
      )}

      <section className="card p-4">
        <BodyChart logs={logs} target={target} />
      </section>

      <section className="grid">
        {[...logs].reverse().map((log) => (
          <div key={log.loggedOn} className="flex items-center justify-between border-b border-zinc-900 py-2 text-sm">
            <span className="text-zinc-400">{new Date(`${log.loggedOn}T12:00:00`).toLocaleDateString('pt-BR')}</span>
            <span className="flex-1 px-3 text-right">
              {log.weightKg !== null && <b>{formatKg(log.weightKg)} kg</b>}
              {measures.filter(([k]) => log[k] !== null).map(([k, l]) => <span key={k} className="ml-2 text-zinc-500">{l} {formatKg(log[k]!)}</span>)}
            </span>
            <button onClick={() => remove(log.loggedOn)} className="text-zinc-600">✕</button>
          </div>
        ))}
      </section>
    </div>
  )
}
