import { useState } from 'react'
import { Link } from 'react-router'
import { Page, PageTitle } from '../../components/AppLayout'
import { Icon } from '../../components/Icon'
import { Button, ErrorText } from '../../components/ui'
import { api } from '../../lib/api'
import {
  addDays,
  AI_DISCLAIMER,
  aiErrorMessage,
  areaLabels,
  mondayOf,
  weekLabel,
  type AiProfile,
  type Insight,
  type WeekReview,
} from '../../lib/ai'
import { todayIso } from '../../lib/nutrition'
import { Loading, Offline, useApi } from '../../lib/useApi'

type Result = { status: 'ok'; cached: boolean; insight: Insight<WeekReview> } | { status: 'insufficient_data' }

function Consent({ onAccepted }: { onAccepted: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function accept() {
    setSaving(true)
    try {
      await api('/ai/profile', { method: 'PUT', body: { consent: true } })
      onAccepted()
    } catch {
      setError('Não foi possível salvar. Tente de novo.')
      setSaving(false)
    }
  }

  return (
    <section className="card grid gap-4 p-6">
      <span className="label-caps">Antes de começar</span>
      <h2 className="num text-2xl font-bold">Análise com IA</h2>
      <div className="grid gap-2 text-sm leading-relaxed text-zinc-400">
        <p>Para analisar sua semana, o DuoFit envia a um modelo de IA (Claude, da Anthropic, via Amazon Bedrock) um resumo dos seus números: treinos, dieta e peso.</p>
        <p>Nome, e-mail e identificadores não são enviados. Você pode revogar o consentimento quando quiser.</p>
        <p>A IA só sugere. Ela não é personal trainer nem nutricionista, e nada muda no seu app sem você aprovar.</p>
      </div>
      <ErrorText>{error}</ErrorText>
      <Button onClick={accept} disabled={saving}>Aceitar e continuar</Button>
    </section>
  )
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <span className="label-caps">{label}</span>
      <span className="num text-3xl leading-none font-bold">{value}<span className="ml-0.5 text-base text-zinc-500">/10</span></span>
    </div>
  )
}

function Review({ review }: { review: WeekReview }) {
  return (
    <div className="grid gap-5">
      <section className="card grid gap-2 p-5">
        <span className="label-caps">Resumo</span>
        <p className="leading-relaxed text-zinc-200">{review.summary}</p>
      </section>

      {review.score && (
        <div className="grid grid-cols-3 gap-3">
          <Score label="Consistência" value={review.score.consistency} />
          <Score label="Treino" value={review.score.training} />
          <Score label="Dieta" value={review.score.diet} />
        </div>
      )}

      <section className="card grid gap-3 p-5">
        <span className="label-caps">O que foi bem</span>
        <ul className="grid gap-2">
          {review.highlights.map((text) => (
            <li key={text} className="flex gap-2.5 text-sm text-zinc-300">
              <Icon name="check" size={18} strokeWidth={2.4} className="mt-0.5 shrink-0 text-lime-400" />
              {text}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3">
        <span className="label-caps">O que melhorar</span>
        {review.improvements.map((item) => (
          <article key={item.issue} className="card grid gap-2 p-5">
            <span className="w-fit rounded-full bg-lime-400/12 px-2.5 py-1 text-xs font-bold text-lime-300">{areaLabels[item.area]}</span>
            <p className="font-semibold">{item.issue}</p>
            <p className="text-sm text-zinc-400">{item.why}</p>
            <p className="rounded-xl bg-surface-2 px-3.5 py-3 text-sm text-zinc-200"><b className="text-lime-400">Faça:</b> {item.action}</p>
          </article>
        ))}
      </section>

      <section className="card grid gap-3 p-5">
        <span className="label-caps">Próxima semana</span>
        <ol className="grid gap-2.5">
          {review.nextWeek.map((text, i) => (
            <li key={text} className="flex gap-3 text-sm text-zinc-300">
              <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lime-400 text-xs font-bold text-ink">{i + 1}</span>
              {text}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

export function WeekReviewPage() {
  const today = todayIso()
  const thisWeek = mondayOf(today)
  const [weekStart, setWeekStart] = useState(thisWeek)
  const [fresh, setFresh] = useState<{ weekStart: string; result: Result } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const profile = useApi<AiProfile>('/ai/profile')
  const saved = useApi<{ insights: Insight<WeekReview>[] }>(profile.data?.consentAt ? `/ai/insights?kind=week_review&periodStart=${weekStart}` : null)

  // Show the latest stored analysis for the selected week without calling the model again.
  const stored = saved.data?.insights.find((i) => i.status !== 'dismissed' && i.periodStart === weekStart)
  const result: Result | null =
    fresh?.weekStart === weekStart ? fresh.result : stored ? { status: 'ok', cached: true, insight: stored } : null

  function changeWeek(next: string) {
    setWeekStart(next)
    setError('')
  }

  async function analyze() {
    setLoading(true)
    setError('')
    try {
      setFresh({ weekStart, result: await api<Result>('/ai/week-review', { method: 'POST', body: { weekStart } }) })
    } catch (e) {
      setError(aiErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  const isCurrent = weekStart === thisWeek

  return (
    <Page>
      <header className="flex items-center justify-between">
        <Link to="/" className="text-zinc-400">Voltar</Link>
      </header>
      <PageTitle>Analisar semana</PageTitle>

      {profile.error && <Offline />}
      {!profile.data && !profile.error && <Loading />}
      {profile.data && !profile.data.consentAt && <Consent onAccepted={profile.reload} />}

      {profile.data?.consentAt && (
        <>
          <div className="flex items-center justify-between gap-3">
            <button aria-label="Semana anterior" onClick={() => changeWeek(addDays(weekStart, -7))} className="grid h-11 w-11 place-items-center rounded-full border border-line text-zinc-300">
              <Icon name="back" />
            </button>
            <div className="flex flex-col items-center">
              <span className="num text-lg font-bold">{weekLabel(weekStart)}</span>
              <span className="text-xs text-muted">{isCurrent ? 'Semana atual' : 'Segunda a domingo'}</span>
            </div>
            <button
              aria-label="Próxima semana"
              disabled={isCurrent}
              onClick={() => changeWeek(addDays(weekStart, 7))}
              className="grid h-11 w-11 rotate-180 place-items-center rounded-full border border-line text-zinc-300 disabled:opacity-30"
            >
              <Icon name="back" />
            </button>
          </div>

          <Button onClick={analyze} disabled={loading}>
            {loading ? 'Analisando…' : result?.status === 'ok' ? 'Analisar de novo' : 'Analisar semana'}
          </Button>
          <ErrorText>{error}</ErrorText>

          {result?.status === 'insufficient_data' && (
            <p className="card p-5 text-sm text-zinc-400">
              Ainda não há dados suficientes nessa semana. Registre pelo menos um treino ou 2 dias de dieta e tente de novo.
            </p>
          )}
          {result?.status === 'ok' && <Review review={result.insight.output} />}
          <p className="text-center text-xs leading-relaxed text-muted">{AI_DISCLAIMER}</p>
        </>
      )}
    </Page>
  )
}
