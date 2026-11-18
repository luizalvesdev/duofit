import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Page, PageTitle } from '../../components/AppLayout'
import { AiConsent } from '../../components/AiConsent'
import { MacroBars } from '../../components/MacroBars'
import { Button, ErrorText } from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { AI_DIET_DRAFT_DISCLAIMER, aiErrorMessage, type AiProfile, type DietDraft, type Insight } from '../../lib/ai'
import type { ProfileResponse } from '../../lib/types'
import { Loading, Offline, useApi } from '../../lib/useApi'

type Result = { status: 'ok'; cached: boolean; insight: Insight<DietDraft> } | { status: 'insufficient_data' }

function Preview({ insight }: { insight: Insight<DietDraft> }) {
  const navigate = useNavigate()
  const draft = insight.output
  const profile = useApi<ProfileResponse>('/profile')
  const [understood, setUnderstood] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function apply() {
    setSaving(true)
    setError('')
    try {
      await api(`/ai/insights/${insight.id}/apply`, { method: 'POST', body: { replacePlan: true } })
      navigate('/dieta/plano')
    } catch (e) {
      setError(e instanceof ApiError ? aiErrorMessage(e) : 'Não foi possível aplicar o plano.')
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5">
      <section className="card grid gap-2 p-5">
        <span className="label-caps">Por que essas escolhas</span>
        <p className="leading-relaxed text-zinc-200">{draft.rationale}</p>
      </section>

      {draft.warnings.map((w) => (
        <p key={w} role="alert" className="rounded-xl bg-amber-500/10 px-3.5 py-3 text-sm text-amber-300">{w}</p>
      ))}

      <MacroBars
        title="Total do dia"
        total={{ kcal: draft.totals.kcal, protein: draft.totals.proteinG, carbs: draft.totals.carbsG, fat: draft.totals.fatG }}
        goal={profile.data?.goal ?? null}
      />

      {draft.meals.map((meal) => (
        <section key={meal.name} className="card p-4">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-semibold">{meal.name}</h2>
            <span className="num text-sm text-zinc-500">{meal.items.reduce((s, i) => s + i.kcal, 0)} kcal</span>
          </div>
          {meal.items.map((item) => (
            <div key={item.foodId} className="flex items-center gap-2 border-t border-zinc-900 py-2 text-sm">
              <span className="flex-1">{item.foodName}</span>
              <span className="num text-zinc-400">{item.grams} g</span>
              <span className="num w-16 text-right text-xs text-zinc-500">{item.kcal} kcal</span>
            </div>
          ))}
        </section>
      ))}

      <label className="card flex items-start gap-3 p-4 text-sm text-zinc-300">
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-lime-400" />
        Entendo que isso substitui o meu plano de dieta atual.
      </label>
      <ErrorText>{error}</ErrorText>
      <Button onClick={apply} disabled={!understood || saving}>{saving ? 'Aplicando…' : 'Usar como meu plano'}</Button>
    </div>
  )
}

export function DietDraftPage() {
  const profile = useApi<AiProfile>('/ai/profile')
  const saved = useApi<{ insights: Insight<DietDraft>[] }>(profile.data?.consentAt ? '/ai/insights?kind=diet_draft' : null)
  const [fresh, setFresh] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const latest = saved.data?.insights.find((i) => i.status === 'ready')
  const result: Result | null = fresh ?? (latest ? { status: 'ok', cached: true, insight: latest } : null)
  const answers = profile.data?.answers
  const hasDietAnswers = !!answers && (!!answers.mealsPerDay || !!answers.dietRestrictions?.length || !!answers.allergies || !!answers.dislikedFoods)

  async function generate() {
    setLoading(true)
    setError('')
    try {
      setFresh(await api<Result>('/ai/drafts/diet', { method: 'POST', body: {} }))
    } catch (e) {
      setError(aiErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Page>
      <header className="flex items-center justify-between">
        <Link to="/dieta/plano" className="text-zinc-400">Voltar</Link>
        {profile.data?.consentAt && <Link to="/ia/questionario?next=/ia/dieta/montar" className="text-sm text-lime-400">{hasDietAnswers ? 'Editar respostas' : 'Responder questionário'}</Link>}
      </header>
      <PageTitle>Plano com IA</PageTitle>

      {profile.error && <Offline />}
      {!profile.data && !profile.error && <Loading />}
      {profile.data && !profile.data.consentAt && <AiConsent onAccepted={profile.reload} />}

      {profile.data?.consentAt && (
        <>
          <p className="text-sm text-zinc-500">
            A IA monta um dia de alimentação a partir da sua meta de calorias e macros, que é calculada pelo app. {!hasDietAnswers && 'Responda o questionário para ela respeitar suas restrições e alergias.'}
          </p>
          <Button onClick={generate} disabled={loading}>{loading ? 'Montando…' : result?.status === 'ok' ? 'Gerar outro rascunho' : 'Gerar rascunho'}</Button>
          <ErrorText>{error}</ErrorText>
          {result?.status === 'insufficient_data' && <p className="card p-5 text-sm text-zinc-400">Poucos alimentos disponíveis com as suas restrições.</p>}
          {result?.status === 'ok' && <Preview key={result.insight.id} insight={result.insight} />}
          <p className="text-center text-xs leading-relaxed text-muted">{AI_DIET_DRAFT_DISCLAIMER}</p>
        </>
      )}
    </Page>
  )
}
