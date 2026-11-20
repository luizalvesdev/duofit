import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Page, PageTitle } from '../../components/AppLayout'
import { AiConsent } from '../../components/AiConsent'
import { Button, ErrorText } from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { AI_WORKOUT_DISCLAIMER, aiErrorMessage, hasWorkoutAnswers, type AiProfile, type Insight, type WorkoutChat } from '../../lib/ai'
import { refreshCache } from '../../lib/sync'
import { Loading, Offline, useApi } from '../../lib/useApi'
import { muscleLabels, weekdayLabels, type Muscle } from '../../lib/workout'

type Turn = { role: 'user'; content: string } | { role: 'assistant'; insight: Insight<WorkoutChat> }

// The conversation lives in this tab only: it survives navigation, not closing the app.
const STORAGE_KEY = 'duofit:workout-chat'
const MAX_MESSAGES = 20

const loadTurns = (): Turn[] => {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]') as Turn[]
  } catch {
    return []
  }
}

/** What the model sees of its own earlier turns: the reply plus a note about any proposal. */
const asMessage = (t: Turn) =>
  t.role === 'user'
    ? { role: 'user' as const, content: t.content }
    : {
        role: 'assistant' as const,
        content: [
          t.insight.output.reply,
          t.insight.output.proposal &&
            `[Mudança proposta: ${t.insight.output.proposal.summary} ${t.insight.status === 'applied' ? '(aplicada)' : '(ainda não aplicada)'}]`,
        ]
          .filter(Boolean)
          .join('\n')
          .slice(0, 1500),
      }

function Proposal({ insight, onApplied }: { insight: Insight<WorkoutChat>; onApplied: (i: Insight<WorkoutChat>) => void }) {
  const proposal = insight.output.proposal!
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const applied = insight.status === 'applied'

  async function apply() {
    setSaving(true)
    setError('')
    try {
      await api(`/ai/insights/${insight.id}/apply`, { method: 'POST', body: {} })
      await refreshCache()
      onApplied({ ...insight, status: 'applied' })
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'plan_changed'
          ? 'Seu treino mudou depois dessa sugestão. Peça de novo para a IA.'
          : e instanceof ApiError && e.code === 'already_handled'
            ? 'Essa mudança já foi aplicada.'
            : 'Não foi possível aplicar. Precisa de internet.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-3 rounded-xl border border-line-strong p-3">
      <span className="label-caps">Mudança proposta</span>
      <p className="text-sm text-zinc-200">{proposal.summary}</p>
      {proposal.changes.map((c, i) => (
        <div key={i} className="grid gap-1">
          <b className="text-sm">
            {c.templateId ? '' : 'Nova · '}
            {c.name}
            <span className="ml-2 font-normal text-zinc-500">{c.weekdays.map((d) => weekdayLabels[d]).join(' · ')}</span>
          </b>
          <ol className="grid gap-0.5 text-xs text-zinc-400">
            {c.items.map((it, k) => (
              <li key={k}>
                {it.exerciseName} · {muscleLabels[it.muscle as Muscle] ?? it.muscle} · {it.targetSets}×
                {it.repMin === it.repMax ? it.repMin : `${it.repMin}-${it.repMax}`}
              </li>
            ))}
          </ol>
        </div>
      ))}
      {proposal.remove.length > 0 && (
        <p className="text-sm text-red-300">Remove: {proposal.remove.map((r) => r.name).join(', ')}</p>
      )}
      <ErrorText>{error}</ErrorText>
      {applied ? (
        <p className="text-sm font-semibold text-lime-400">Aplicada ao seu treino.</p>
      ) : (
        <Button onClick={apply} disabled={saving}>{saving ? 'Aplicando…' : 'Aplicar mudança'}</Button>
      )}
    </div>
  )
}

function Chat() {
  const [turns, setTurns] = useState<Turn[]>(loadTurns)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns))
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns])

  async function send(e: FormEvent) {
    e.preventDefault()
    const content = text.trim()
    if (!content || sending) return
    const next: Turn[] = [...turns, { role: 'user', content: content.slice(0, 1500) }]
    setTurns(next)
    setText('')
    setSending(true)
    setError('')
    try {
      const { insight } = await api<{ insight: Insight<WorkoutChat> }>('/ai/workout-chat', {
        method: 'POST',
        body: { messages: next.slice(-MAX_MESSAGES).map(asMessage) },
      })
      setTurns([...next, { role: 'assistant', insight }])
    } catch (err) {
      setError(aiErrorMessage(err))
      setTurns(turns)
      setText(content)
    } finally {
      setSending(false)
    }
  }

  const replace = (updated: Insight<WorkoutChat>) =>
    setTurns((prev) => prev.map((t) => (t.role === 'assistant' && t.insight.id === updated.id ? { ...t, insight: updated } : t)))

  return (
    <div className="grid gap-4">
      {turns.length === 0 && (
        <section className="card grid gap-2 p-5 text-sm text-zinc-400">
          <p>Pergunte sobre o seu treino atual: por que um exercício está lá, se dá para trocar algo, se o volume está bom.</p>
          <p>Se fizer sentido mudar, a IA propõe a mudança e você decide se aplica.</p>
        </section>
      )}

      {turns.map((t, i) =>
        t.role === 'user' ? (
          <p key={i} className="max-w-[85%] justify-self-end rounded-2xl bg-lime-400/15 px-4 py-2.5 text-sm whitespace-pre-wrap text-zinc-100">
            {t.content}
          </p>
        ) : (
          <div key={i} className="card grid max-w-[95%] gap-3 p-4">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-zinc-200">{t.insight.output.reply}</p>
            {t.insight.output.proposal && <Proposal insight={t.insight} onApplied={replace} />}
          </div>
        ),
      )}
      {sending && <p className="text-sm text-zinc-500">A IA está pensando…</p>}
      <ErrorText>{error}</ErrorText>

      <form onSubmit={send} className="grid gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) send(e)
          }}
          maxLength={1500}
          rows={3}
          placeholder="Ex.: por que tenho dois treinos de peito? Dá para trocar o agachamento?"
          className="w-full rounded-xl border border-line-strong bg-surface-2 p-3.5 text-zinc-50 outline-none focus:border-lime-400 focus:ring-4 focus:ring-lime-400/15"
        />
        <Button type="submit" disabled={sending || !text.trim()}>Enviar</Button>
      </form>
      {turns.length > 0 && (
        <button onClick={() => setTurns([])} disabled={sending} className="justify-self-center text-sm text-zinc-500">
          Nova conversa
        </button>
      )}
      <div ref={bottom} />
    </div>
  )
}

export function WorkoutChatPage() {
  const profile = useApi<AiProfile>('/ai/profile')
  const ready = profile.data?.consentAt && hasWorkoutAnswers(profile.data.answers)

  return (
    <Page>
      <header className="flex items-center justify-between">
        <Link to="/treinos" className="text-zinc-400">Voltar</Link>
      </header>
      <PageTitle>Questionar a IA</PageTitle>

      {profile.error && <Offline />}
      {!profile.data && !profile.error && <Loading />}
      {profile.data && !profile.data.consentAt && <AiConsent onAccepted={profile.reload} />}
      {profile.data?.consentAt && !ready && (
        <section className="card grid gap-3 p-6">
          <p className="text-sm text-zinc-400">Responda o questionário de treino para a IA conhecer seu nível, dias e equipamentos.</p>
          <Link to="/ia/questionario?next=/ia/treino/conversa" className="flex h-12 items-center justify-center rounded-[14px] bg-lime-400 font-extrabold text-ink">Responder questionário</Link>
        </section>
      )}
      {ready && (
        <>
          <Chat />
          <p className="text-center text-xs leading-relaxed text-muted">{AI_WORKOUT_DISCLAIMER}</p>
        </>
      )}
    </Page>
  )
}
