import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Page, PageTitle } from '../../components/AppLayout'
import { AiConsent } from '../../components/AiConsent'
import { Scanner } from '../../components/FoodSearch'
import { NumericInput } from '../../components/NumericInput'
import { Button, ErrorText, Input } from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { foodLabel } from '../../lib/diet'
import { AI_DIET_DRAFT_DISCLAIMER, aiErrorMessage, type AiProfile, type DuoDietDraft, type Insight } from '../../lib/ai'
import { Loading, Offline, useApi } from '../../lib/useApi'
import { DuoTabs } from './DuoPage'
import type { Campaign } from './types'

type Gap = 'consent' | 'profile' | 'goal' | 'weight'
type Result =
  | { status: 'ok'; cached: boolean; insight: Insight<DuoDietDraft> }
  | { status: 'insufficient_data' }
  | { status: 'incomplete'; members: { name: string; missing: Gap[] }[] }
type Member = DuoDietDraft['members'][number]

const GAP_LABEL: Record<Gap, string> = {
  consent: 'aceitar o uso da IA',
  profile: 'completar o perfil (sexo, nascimento, altura)',
  goal: 'definir a meta de calorias',
  weight: 'registrar o peso',
}

const firstName = (name: string) => name.split(' ')[0]
const off = (got: number, want: number) => want > 0 && Math.abs(got / want - 1) > 0.1

function MacroStat({ label, got, want, unit }: { label: string; got: number; want: number; unit: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className={`num ${off(got, want) ? 'text-red-400' : 'text-zinc-200'}`}>
        <b>{Math.round(got)}</b><span className="text-zinc-500">/{Math.round(want)} {unit}</span>
      </span>
    </div>
  )
}

function MemberColumn({ member, onImprove }: { member: Member; onImprove: (mealName: string) => void }) {
  return (
    <section className="card grid gap-3 p-4">
      <h2 className="text-lg font-bold">{firstName(member.name)}</h2>
      <div className="grid gap-1.5 rounded-xl bg-zinc-950 p-3">
        <MacroStat label="Calorias" got={member.totals.kcal} want={member.target.kcal} unit="kcal" />
        <MacroStat label="Proteína" got={member.totals.proteinG} want={member.target.proteinG} unit="g" />
        <MacroStat label="Carboidrato" got={member.totals.carbsG} want={member.target.carbsG} unit="g" />
        <MacroStat label="Gordura" got={member.totals.fatG} want={member.target.fatG} unit="g" />
      </div>
      {(member.warnings ?? []).map((w) => (
        <p key={w} className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">{w}</p>
      ))}
      {(member.meals ?? []).map((meal) => (
        <div key={meal.name} className="grid gap-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{meal.name}</p>
            <button onClick={() => onImprove(meal.name)} className="shrink-0 text-xs text-lime-400">Melhorar</button>
          </div>
          {meal.items.map((item) => (
            <div key={item.foodId} className="border-t border-zinc-900 py-1.5 text-sm">
              <div className="flex items-start justify-between gap-2 text-zinc-300">
                <span className="flex-1">{foodLabel(item.foodName)}</span>
                <span className="num shrink-0 text-zinc-400">{item.grams} g</span>
              </div>
              <p className="num text-sm text-zinc-400">{item.kcal} kcal · P {item.proteinG} · C {item.carbsG} · G {item.fatG}</p>
            </div>
          ))}
        </div>
      ))}
    </section>
  )
}

type Product = { name: string; kcal: number; protein: number; carbs: number; fat: number; servingGrams: number | null }

function ManualProduct({ onSet }: { onSet: (p: Product) => void }) {
  const [name, setName] = useState('')
  const [portion, setPortion] = useState<number | null>(null)
  const [v, setV] = useState<Record<'kcal' | 'protein' | 'carbs' | 'fat', number | null>>({ kcal: null, protein: null, carbs: null, fat: null })
  const ready = name.trim().length >= 2 && !!portion && Object.values(v).every((x) => x !== null)
  const per100 = (x: number) => Math.round((x / portion!) * 1000) / 10
  return (
    <div className="grid gap-2 rounded-xl bg-zinc-950 p-3">
      <Input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="Nome do produto" />
      <div className="w-28"><NumericInput decimal value={portion} onCommit={setPortion} placeholder="porção g" /></div>
      <div className="grid grid-cols-4 gap-2">
        {([['kcal', 'Kcal'], ['protein', 'Prot'], ['carbs', 'Carb'], ['fat', 'Gord']] as const).map(([k, l]) => (
          <label key={k} className="grid gap-1 text-center text-xs text-zinc-500">
            {l}
            <NumericInput decimal value={v[k]} onCommit={(x) => setV((p) => ({ ...p, [k]: x }))} />
          </label>
        ))}
      </div>
      <button
        disabled={!ready}
        onClick={() => onSet({ name, kcal: per100(v.kcal!), protein: per100(v.protein!), carbs: per100(v.carbs!), fat: per100(v.fat!), servingGrams: portion })}
        className="rounded-lg bg-zinc-800 py-2 text-sm font-semibold text-lime-400 disabled:opacity-40"
      >
        Usar produto
      </button>
    </div>
  )
}

function ImproveMealModal({
  insightId,
  memberUserId,
  mealName,
  onDone,
  onClose,
}: {
  insightId: string
  memberUserId: string
  mealName: string
  onDone: (output: DuoDietDraft) => void
  onClose: () => void
}) {
  const [instruction, setInstruction] = useState('')
  const [product, setProduct] = useState<Product | null>(null)
  const [mode, setMode] = useState<'none' | 'manual' | 'scan'>('none')
  const [busy, setBusy] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function fromBarcode(code: string) {
    setMode('none')
    setBusy('Buscando produto…')
    setError('')
    try {
      setProduct(await api<Product>(`/diet/foods/barcode/${code}`))
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'not_found' ? 'Produto não encontrado na base.' : 'Não deu para buscar o código.')
    } finally {
      setBusy('')
    }
  }

  async function fromPhoto(file: File) {
    setBusy('Lendo o rótulo…')
    setError('')
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(r.result as string)
        r.onerror = () => rej(r.error)
        r.readAsDataURL(file)
      })
      const data = await api<Omit<Product, 'name'> & { name: string | null }>('/ai/nutrition-from-label', {
        method: 'POST',
        body: { image: dataUrl.split(',')[1], mediaType: file.type },
      })
      setProduct({ ...data, name: data.name || 'Produto do rótulo' })
    } catch (e) {
      setError(e instanceof ApiError ? aiErrorMessage(e) : 'Não deu para ler o rótulo. Tente a foto mais nítida ou digite os valores.')
    } finally {
      setBusy('')
    }
  }

  async function submit() {
    if (instruction.trim().length < 3) return setError('Diga o que você quer mudar.')
    setSaving(true)
    setError('')
    try {
      const { insight } = await api<{ insight: Insight<DuoDietDraft> }>(`/ai/insights/${insightId}/improve-meal`, {
        method: 'POST',
        body: { memberUserId, mealName, instruction, product: product ?? undefined },
      })
      onDone(insight.output)
    } catch (e) {
      setError(e instanceof ApiError ? aiErrorMessage(e) : 'Não foi possível melhorar a refeição.')
      setSaving(false)
    }
  }

  if (mode === 'scan') return <div className="fixed inset-0 z-50 bg-zinc-950"><Scanner onCancel={() => setMode('none')} onCode={fromBarcode} /></div>

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4" onClick={onClose}>
      <div className="card grid w-full max-w-sm gap-4 p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-semibold">Melhorar — {mealName}</h2>
        <p className="text-sm text-zinc-500">O que você quer mudar nessa refeição?</p>
        <Input autoFocus value={instruction} maxLength={300} onChange={(e) => setInstruction(e.target.value)} placeholder="Ex.: troque por 2 fatias de pão integral com atum" />

        <div className="grid gap-2">
          <p className="text-xs uppercase tracking-wide text-zinc-600">Produto específico (opcional)</p>
          {product ? (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-zinc-950 px-3 py-2 text-sm">
              <span className="flex-1">{product.name} <span className="text-zinc-500">· {Math.round(product.kcal)} kcal/100g</span></span>
              <button onClick={() => setProduct(null)} className="text-zinc-500">remover</button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 text-sm">
                <button onClick={() => setMode('scan')} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-lime-400">Código de barras</button>
                <button onClick={() => fileRef.current?.click()} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-lime-400">Foto do rótulo</button>
                <button onClick={() => setMode(mode === 'manual' ? 'none' : 'manual')} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300">Digitar</button>
              </div>
              {mode === 'manual' && <ManualProduct onSet={(p) => { setProduct(p); setMode('none') }} />}
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && fromPhoto(e.target.files[0])} />
            </>
          )}
          {busy && <p className="text-sm text-zinc-400">{busy}</p>}
        </div>

        <ErrorText>{error}</ErrorText>
        <Button onClick={submit} disabled={saving || !!busy}>{saving ? 'Melhorando…' : 'Melhorar refeição'}</Button>
        <button onClick={onClose} className="text-sm text-zinc-500">Cancelar</button>
      </div>
    </div>
  )
}

function Preview({ insight, campaign }: { insight: Insight<DuoDietDraft>; campaign: Campaign }) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState(insight.output)
  const [improving, setImproving] = useState<{ memberUserId: string; mealName: string } | null>(null)
  const [understood, setUnderstood] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function apply() {
    setSaving(true)
    setError('')
    try {
      await api(`/campaigns/${campaign.id}/diet/apply`, { method: 'POST', body: { insightId: insight.id } })
      navigate('/dieta')
    } catch (e) {
      // already_handled = the plan was already applied (e.g. the first request timed out but the server finished).
      if (e instanceof ApiError && e.code === 'already_handled') return navigate('/dieta')
      setError(e instanceof ApiError ? aiErrorMessage(e) : 'Não foi possível aplicar o plano.')
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5">
      {improving && (
        <ImproveMealModal
          insightId={insight.id}
          memberUserId={improving.memberUserId}
          mealName={improving.mealName}
          onClose={() => setImproving(null)}
          onDone={(output) => { setDraft(output); setImproving(null) }}
        />
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {draft.members.map((m) => (
          <MemberColumn key={m.userId} member={m} onImprove={(mealName) => setImproving({ memberUserId: m.userId, mealName })} />
        ))}
      </div>

      <label className="card flex items-start gap-3 p-4 text-sm text-zinc-300">
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-lime-400" />
        Entendo que isso substitui o plano de dieta atual dos dois ({draft.members.map((m) => firstName(m.name)).join(' e ')}).
      </label>
      <ErrorText>{error}</ErrorText>
      <Button onClick={apply} disabled={!understood || saving}>{saving ? 'Aplicando…' : 'Usar como plano da dupla'}</Button>
    </div>
  )
}

export function DuoDietPage() {
  const campaigns = useApi<{ campaigns: Campaign[] }>('/campaigns')
  const profile = useApi<AiProfile>('/ai/profile')
  const [fresh, setFresh] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const campaign = campaigns.data?.campaigns.at(-1)
  const saved = useApi<{ insights: Insight<DuoDietDraft>[] }>(profile.data?.consentAt ? '/ai/insights?kind=diet_draft_duo' : null)
  // Skip drafts saved under the old shared-menu shape (members without their own meals); regenerate instead.
  const latest = saved.data?.insights.find((i) => i.status === 'ready' && Array.isArray(i.output.members?.[0]?.meals))
  const result: Result | null = fresh ?? (latest ? { status: 'ok', cached: true, insight: latest } : null)
  const answers = profile.data?.answers
  const hasDietAnswers = !!answers && (!!answers.mealsPerDay || !!answers.dietRestrictions?.length || !!answers.allergies || !!answers.dislikedFoods)

  async function generate() {
    if (!campaign) return
    setLoading(true)
    setError('')
    try {
      setFresh(await api<Result>('/ai/drafts/diet-duo', { method: 'POST', body: { campaignId: campaign.id } }))
    } catch (e) {
      setError(aiErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Page wide>
      <PageTitle>Dupla</PageTitle>
      <DuoTabs />

      {(campaigns.error || profile.error) && <Offline />}
      {(!campaigns.data || !profile.data) && !campaigns.error && !profile.error && <Loading />}

      {campaigns.data && !campaign && (
        <p className="card p-5 text-center text-sm text-zinc-400">
          Entre numa dupla primeiro para montar a dieta do casal. <Link to="/dupla" className="text-lime-400">Ir para Dupla</Link>
        </p>
      )}

      {campaign && campaign.members.length < 2 && (
        <p className="card p-5 text-center text-sm text-zinc-400">
          A dieta do casal precisa dos dois na dupla. Passe o código para o seu par entrar.
        </p>
      )}

      {campaign && campaign.members.length >= 2 && profile.data && !profile.data.consentAt && <AiConsent onAccepted={profile.reload} />}

      {campaign && campaign.members.length >= 2 && profile.data?.consentAt && (
        <>
          <header className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">A IA monta um plano completo para cada um, lado a lado, batendo as metas de cada pessoa.</p>
            <Link to="/ia/questionario?next=/dupla/dieta" className="shrink-0 text-sm text-lime-400">{hasDietAnswers ? 'Editar respostas' : 'Questionário'}</Link>
          </header>
          <Button onClick={generate} disabled={loading}>{loading ? 'Montando…' : result?.status === 'ok' ? 'Gerar outro rascunho' : 'Gerar rascunho'}</Button>
          <ErrorText>{error}</ErrorText>
          {result?.status === 'incomplete' && (
            <div className="card grid gap-2 p-5 text-sm">
              <p className="font-semibold text-amber-300">Falta completar antes de montar a dieta do casal:</p>
              {result.members.map((m) => (
                <p key={m.name} className="text-zinc-300"><b>{m.name}</b>: {m.missing.map((g) => GAP_LABEL[g]).join(', ')}.</p>
              ))}
              <p className="text-zinc-500">Cada um resolve na própria conta: perfil e meta em <Link to="/perfil" className="text-lime-400">Perfil</Link>, peso e consentimento da IA no app.</p>
            </div>
          )}
          {result?.status === 'insufficient_data' && <p className="card p-5 text-sm text-zinc-400">Poucos alimentos disponíveis com as restrições de um dos dois.</p>}
          {result?.status === 'ok' && <Preview key={result.insight.id} insight={result.insight} campaign={campaign} />}
          <p className="text-center text-xs leading-relaxed text-muted">{AI_DIET_DRAFT_DISCLAIMER}</p>
        </>
      )}
    </Page>
  )
}
