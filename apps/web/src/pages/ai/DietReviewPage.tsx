import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Page, PageTitle } from '../../components/AppLayout'
import { AiConsent } from '../../components/AiConsent'
import { Button, ErrorText } from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { foodLabel } from '../../lib/diet'
import { AI_DIET_DISCLAIMER, aiErrorMessage, type AiProfile, type DietReview, type Insight } from '../../lib/ai'
import { Loading, Offline, useApi } from '../../lib/useApi'

type Result = { status: 'ok'; cached: boolean; insight: Insight<DietReview> } | { status: 'insufficient_data' }

const signed = (n: number, unit = '') => `${n > 0 ? '+' : ''}${Math.round(n * 10) / 10}${unit}`

function Delta({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="card flex flex-col gap-1 p-3">
      <span className="label-caps">{label}</span>
      <span className="num text-xl leading-none font-bold">{signed(value, unit)}</span>
    </div>
  )
}

function Review({ insight }: { insight: Insight<DietReview> }) {
  const navigate = useNavigate()
  const review = insight.output
  const [selected, setSelected] = useState<Set<number>>(() => new Set(review.swaps.map((_, i) => i)))
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const applied = insight.status === 'applied'

  const chosen = review.swaps.filter((_, i) => selected.has(i))
  const delta = (key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG') => chosen.reduce((s, x) => s + x.to[key] - x.from[key], 0)

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (!next.delete(i)) next.add(i)
      return next
    })
  }

  async function apply() {
    setApplying(true)
    setError('')
    try {
      await api(`/ai/insights/${insight.id}/apply`, { method: 'POST', body: { swapIndexes: [...selected] } })
      navigate('/dieta/plano')
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'plan_changed'
          ? 'O plano mudou depois dessa revisão. Gere uma nova revisão.'
          : 'Não foi possível aplicar as trocas.',
      )
      setApplying(false)
    }
  }

  return (
    <div className="grid gap-5">
      <section className="card grid gap-2 p-5">
        <span className="label-caps">Resumo</span>
        <p className="leading-relaxed text-zinc-200">{review.summary}</p>
        <p className="num text-sm text-zinc-400">
          Plano: <b className="text-zinc-50">{review.totals.kcal}</b> kcal · {review.totals.proteinG} P · {review.totals.carbsG} C · {review.totals.fatG} G
          {review.target && <> — meta {review.target.kcal} kcal · {review.target.proteinG} P · {review.target.carbsG} C · {review.target.fatG} G</>}
        </p>
      </section>

      {review.issues.length > 0 && (
        <section className="grid gap-3">
          <span className="label-caps">O que melhorar</span>
          {review.issues.map((item) => (
            <article key={item.issue} className="card grid gap-1.5 p-5">
              <p className="font-semibold">{item.issue}</p>
              <p className="text-sm text-zinc-400">{item.why}</p>
            </article>
          ))}
        </section>
      )}

      <section className="grid gap-3">
        <span className="label-caps">Trocas sugeridas</span>
        {review.swaps.length === 0 && <p className="card p-5 text-sm text-zinc-400">Nenhuma troca necessária. Seu plano está coerente com a meta.</p>}
        {review.swaps.map((swap, i) => (
          <label key={swap.planItemId} className={`card flex gap-3 p-4 ${applied ? 'opacity-60' : ''}`}>
            <input type="checkbox" checked={selected.has(i)} disabled={applied} onChange={() => toggle(i)} className="mt-1 h-5 w-5 shrink-0 accent-lime-400" />
            <span className="grid min-w-0 flex-1 gap-1">
              <span className="text-xs text-muted">{swap.meal}</span>
              <span className="text-sm text-zinc-400 line-through">{foodLabel(swap.from.foodName)} · {swap.from.grams} g</span>
              <span className="font-semibold">{foodLabel(swap.to.foodName)} · {swap.to.grams} g</span>
              <span className="text-sm text-zinc-400">{swap.reason}</span>
              <span className="num text-xs text-zinc-500">
                {signed(swap.to.kcal - swap.from.kcal)} kcal · {signed(swap.to.proteinG - swap.from.proteinG, ' g')} P · {signed(swap.to.carbsG - swap.from.carbsG, ' g')} C · {signed(swap.to.fatG - swap.from.fatG, ' g')} G
              </span>
            </span>
          </label>
        ))}

        {chosen.length > 0 && !applied && (
          <>
            <div className="grid grid-cols-4 gap-2">
              <Delta label="kcal" value={delta('kcal')} unit="" />
              <Delta label="Prot." value={delta('proteinG')} unit=" g" />
              <Delta label="Carb." value={delta('carbsG')} unit=" g" />
              <Delta label="Gord." value={delta('fatG')} unit=" g" />
            </div>
            <ErrorText>{error}</ErrorText>
            <Button onClick={apply} disabled={applying}>{applying ? 'Aplicando…' : `Aplicar ${chosen.length} troca${chosen.length > 1 ? 's' : ''}`}</Button>
          </>
        )}
        {applied && <p className="text-center text-sm text-lime-400">Trocas aplicadas ao seu plano.</p>}
      </section>

      {review.tips.length > 0 && (
        <section className="card grid gap-2 p-5">
          <span className="label-caps">Dicas</span>
          <ul className="grid gap-2 text-sm text-zinc-300">
            {review.tips.map((tip) => <li key={tip}>• {tip}</li>)}
          </ul>
        </section>
      )}
    </div>
  )
}

export function DietReviewPage() {
  const profile = useApi<AiProfile>('/ai/profile')
  const saved = useApi<{ insights: Insight<DietReview>[] }>(profile.data?.consentAt ? '/ai/insights?kind=diet_review' : null)
  const [fresh, setFresh] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const latest = saved.data?.insights.find((i) => i.status === 'ready')
  const result: Result | null = fresh ?? (latest ? { status: 'ok', cached: true, insight: latest } : null)

  async function review() {
    setLoading(true)
    setError('')
    try {
      setFresh(await api<Result>('/ai/diet-review', { method: 'POST', body: {} }))
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
      </header>
      <PageTitle>Revisar dieta</PageTitle>

      {profile.error && <Offline />}
      {!profile.data && !profile.error && <Loading />}
      {profile.data && !profile.data.consentAt && <AiConsent onAccepted={profile.reload} />}

      {profile.data?.consentAt && (
        <>
          <p className="text-sm text-zinc-500">A IA compara o plano salvo com a sua meta e sugere trocas. Nada muda sem você aplicar.</p>
          <Button onClick={review} disabled={loading}>{loading ? 'Revisando…' : result?.status === 'ok' ? 'Revisar de novo' : 'Revisar meu plano'}</Button>
          <ErrorText>{error}</ErrorText>
          {result?.status === 'insufficient_data' && (
            <p className="card p-5 text-sm text-zinc-400">Seu plano está vazio. <Link to="/dieta/plano" className="text-lime-400">Monte o plano</Link> e volte aqui.</p>
          )}
          {result?.status === 'ok' && <Review key={result.insight.id} insight={result.insight} />}
          <p className="text-center text-xs leading-relaxed text-muted">{AI_DIET_DISCLAIMER}</p>
        </>
      )}
    </Page>
  )
}
