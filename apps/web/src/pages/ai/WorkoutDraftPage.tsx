import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Page, PageTitle } from '../../components/AppLayout'
import { AiConsent } from '../../components/AiConsent'
import { ExercisePicker } from '../../components/ExercisePicker'
import { Button, ErrorText } from '../../components/ui'
import { api } from '../../lib/api'
import { AI_WORKOUT_DISCLAIMER, aiErrorMessage, hasWorkoutAnswers, type AiProfile, type Insight, type WorkoutDraft } from '../../lib/ai'
import { refreshCache } from '../../lib/sync'
import { Loading, Offline, useApi } from '../../lib/useApi'
import { muscleLabels, weekdayLabels, type Muscle } from '../../lib/workout'

type Result = { status: 'ok'; cached: boolean; insight: Insight<WorkoutDraft> } | { status: 'insufficient_data' }
type Draft = WorkoutDraft['templates'][number] & { include: boolean }

function Preview({ insight }: { insight: Insight<WorkoutDraft> }) {
  const navigate = useNavigate()
  const draft = insight.output
  const [templates, setTemplates] = useState<Draft[]>(() => draft.templates.map((t) => ({ ...t, include: true })))
  const [replacing, setReplacing] = useState<{ t: number; i: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const chosen = templates.filter((t) => t.include && t.items.length > 0)
  const patch = (t: number, fn: (d: Draft) => Draft) => setTemplates((prev) => prev.map((d, i) => (i === t ? fn(d) : d)))

  async function create() {
    setSaving(true)
    setError('')
    try {
      await api(`/ai/insights/${insight.id}/apply`, {
        method: 'POST',
        body: {
          templates: chosen.map((t) => ({
            name: t.name,
            weekdays: t.weekdays,
            items: t.items.map(({ exerciseId, targetSets, repMin, repMax, restSeconds, notes }) => ({ exerciseId, targetSets, repMin, repMax, restSeconds, notes })),
          })),
        },
      })
      await refreshCache()
      navigate('/treinos')
    } catch {
      setError('Não foi possível criar os treinos. Precisa de internet.')
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5">
      <section className="card grid gap-2 p-5">
        <span className="label-caps">Divisão · {draft.split}</span>
        <p className="leading-relaxed text-zinc-200">{draft.rationale}</p>
      </section>

      {templates.map((t, ti) => (
        <section key={ti} className={`card grid gap-3 p-4 ${t.include ? '' : 'opacity-50'}`}>
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={t.include} onChange={(e) => patch(ti, (d) => ({ ...d, include: e.target.checked }))} className="mt-1 h-5 w-5 shrink-0 accent-lime-400" />
            <span className="grid gap-0.5">
              <b className="text-lg">{t.name}</b>
              <span className="text-sm text-zinc-500">{t.weekdays.length ? t.weekdays.map((d) => weekdayLabels[d]).join(' · ') : 'Sem dia fixo'}</span>
            </span>
          </label>
          <ol className="grid">
            {t.items.map((item, ii) => (
              <li key={`${item.exerciseId}-${ii}`} className="flex items-center gap-2 border-t border-zinc-900 py-2.5 text-sm">
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate font-medium">{item.exerciseName}</span>
                  <span className="num text-xs text-zinc-500">
                    {muscleLabels[item.muscle as Muscle] ?? item.muscle} · {item.targetSets}×{item.repMin === item.repMax ? item.repMin : `${item.repMin}-${item.repMax}`} · {item.restSeconds}s
                  </span>
                  {item.notes && <span className="text-xs text-zinc-400">{item.notes}</span>}
                </span>
                <button onClick={() => setReplacing({ t: ti, i: ii })} className="px-2 text-xs text-zinc-400">Trocar</button>
                <button
                  aria-label="Remover exercício"
                  onClick={() => patch(ti, (d) => ({ ...d, items: d.items.filter((_, k) => k !== ii) }))}
                  className="px-2 text-red-400"
                >✕</button>
              </li>
            ))}
          </ol>
          {t.items.length === 0 && <p className="text-sm text-zinc-500">Sem exercícios. Essa ficha não será criada.</p>}
        </section>
      ))}

      <ErrorText>{error}</ErrorText>
      <Button onClick={create} disabled={saving || chosen.length === 0}>
        {saving ? 'Criando…' : `Criar ${chosen.length} ficha${chosen.length === 1 ? '' : 's'}`}
      </Button>
      <p className="text-center text-xs text-muted">Depois de criar, você ainda pode editar cada ficha em Treinos.</p>

      {replacing && (
        <ExercisePicker
          onClose={() => setReplacing(null)}
          onSelect={(exercise) => {
            patch(replacing.t, (d) => ({
              ...d,
              items: d.items.map((it, k) =>
                k === replacing.i ? { ...it, exerciseId: exercise.id, exerciseName: exercise.name, muscle: exercise.primaryMuscle } : it,
              ),
            }))
            setReplacing(null)
          }}
        />
      )}
    </div>
  )
}

export function WorkoutDraftPage() {
  const profile = useApi<AiProfile>('/ai/profile')
  const saved = useApi<{ insights: Insight<WorkoutDraft>[] }>(profile.data?.consentAt ? '/ai/insights?kind=workout_draft' : null)
  const [fresh, setFresh] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const latest = saved.data?.insights.find((i) => i.status === 'ready')
  const result: Result | null = fresh ?? (latest ? { status: 'ok', cached: true, insight: latest } : null)
  const ready = profile.data?.consentAt && hasWorkoutAnswers(profile.data.answers)

  async function generate() {
    setLoading(true)
    setError('')
    try {
      setFresh(await api<Result>('/ai/drafts/workout', { method: 'POST', body: {} }))
    } catch (e) {
      setError(aiErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Page>
      <header className="flex items-center justify-between">
        <Link to="/treinos" className="text-zinc-400">Voltar</Link>
        {ready && <Link to="/ia/questionario?next=/ia/treino" className="text-sm text-lime-400">Editar respostas</Link>}
      </header>
      <PageTitle>Treino com IA</PageTitle>

      {profile.error && <Offline />}
      {!profile.data && !profile.error && <Loading />}
      {profile.data && !profile.data.consentAt && <AiConsent onAccepted={profile.reload} />}
      {profile.data?.consentAt && !ready && (
        <section className="card grid gap-3 p-6">
          <h2 className="num text-2xl font-bold">Conte sobre o seu treino</h2>
          <p className="text-sm text-zinc-400">São 3 etapas rápidas: experiência, equipamentos, lesões e preferências.</p>
          <Link to="/ia/questionario?next=/ia/treino" className="flex h-12 items-center justify-center rounded-[14px] bg-lime-400 font-extrabold text-ink">Responder questionário</Link>
        </section>
      )}

      {ready && (
        <>
          <p className="text-sm text-zinc-500">A IA monta um rascunho com os exercícios disponíveis para você. Você revisa e escolhe o que criar.</p>
          <Button onClick={generate} disabled={loading}>{loading ? 'Montando…' : result?.status === 'ok' ? 'Gerar outro rascunho' : 'Gerar rascunho'}</Button>
          <ErrorText>{error}</ErrorText>
          {result?.status === 'insufficient_data' && (
            <p className="card p-5 text-sm text-zinc-400">Poucos exercícios disponíveis com os equipamentos escolhidos. Marque mais equipamentos no questionário.</p>
          )}
          {result?.status === 'ok' && <Preview key={result.insight.id} insight={result.insight} />}
          <p className="text-center text-xs leading-relaxed text-muted">{AI_WORKOUT_DISCLAIMER}</p>
        </>
      )}
    </Page>
  )
}
