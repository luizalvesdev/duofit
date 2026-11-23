import { useLiveQuery } from 'dexie-react-hooks'
import { Link, Navigate, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { Page } from '../components/AppLayout'
import { Icon } from '../components/Icon'
import { MacroBars } from '../components/MacroBars'
import { db } from '../lib/db'
import { sum, type DayResponse } from '../lib/diet'
import { objectiveLabels, todayIso } from '../lib/nutrition'
import { startSession } from '../lib/session'
import type { ProfileResponse } from '../lib/types'
import { Loading, useApi } from '../lib/useApi'
import { formatDuration, formatKg } from '../lib/workout'
import type { Campaign, Feed } from './duo/types'

const avatar = (isMe: boolean) => (isMe ? 'bg-lime-400 text-ink' : 'bg-pr text-pr-ink')

function SyncPill() {
  const pending = useLiveQuery(() => db.outbox.count(), [], 0)
  const online = navigator.onLine
  return (
    <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-[13px] text-zinc-300">
      <Icon name={pending || !online ? 'cloudOff' : 'check'} size={14} strokeWidth={2.4} className={pending || !online ? 'text-amber-400' : 'text-lime-400'} />
      {pending ? `${pending} treino(s) aguardando sincronizar` : online ? 'Tudo sincronizado' : 'Sem internet'}
    </div>
  )
}

function TodayWorkout() {
  const navigate = useNavigate()
  const templates = useLiveQuery(() => db.templates.toArray(), [], [])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [])
  const active = useLiveQuery(() => db.active.get('active'), [])
  const today = new Date().getDay()
  const template = templates.find((t) => t.weekdays.includes(today))
  const names = new Map(exercises.map((e) => [e.id, e.name]))

  if (active) {
    return (
      <Link to="/treino" className="grid gap-3 rounded-3xl bg-lime-400 p-6 text-ink">
        <span className="text-xs font-extrabold tracking-[0.08em] uppercase">Em andamento</span>
        <span className="num text-4xl leading-none font-bold lg:text-[44px]">{active.name}</span>
        <span className="flex h-13 items-center gap-2.5 self-start rounded-[14px] bg-ink px-6 font-extrabold text-lime-400"><Icon name="play" size={18} />Continuar</span>
      </Link>
    )
  }

  if (!template) {
    return (
      <Link to="/treinos" className="card grid gap-2 p-6">
        <span className="label-caps">Treino de hoje</span>
        <span className="num text-3xl font-bold">Dia livre</span>
        <span className="text-sm text-zinc-400">Nenhuma ficha marcada para hoje. Ver fichas →</span>
      </Link>
    )
  }

  return (
    <div className="grid gap-4 rounded-3xl bg-lime-400 p-6 text-ink">
      <Link to={`/treinos/${template.id}/ver`} className="grid gap-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold tracking-[0.08em] uppercase">Treino de hoje</span>
          <span className="text-sm font-semibold opacity-75">{template.items.length} exercícios</span>
        </div>
        <span className="num text-4xl leading-none font-bold lg:text-[44px]">{template.name}</span>
        <p className="text-sm leading-relaxed font-medium opacity-85">
          {template.items.map((i) => names.get(i.exerciseId) ?? '…').join(' · ')}
        </p>
      </Link>
      <button
        onClick={async () => {
          await startSession(template)
          navigate('/treino')
        }}
        className="flex h-13 items-center gap-2.5 self-start rounded-[14px] bg-ink px-6 font-extrabold text-lime-400"
      >
        <Icon name="play" size={18} />Começar treino
      </button>
    </div>
  )
}

function DuoFeed({ campaign }: { campaign: Campaign }) {
  const { user } = useAuth()
  const { data } = useApi<Feed>(`/campaigns/${campaign.id}/feed`)
  if (!data) return null
  const name = (id: string) => (id === user?.id ? 'Você' : campaign.members.find((m) => m.userId === id)?.name ?? '?')
  const items = [
    ...data.records.map((r) => ({ key: r.id, at: r.achievedAt, userId: r.userId, text: `bateu PR em ${r.exerciseName}`, sub: `${formatKg(r.weightKg)} kg × ${r.reps}`, pr: true })),
    ...data.sessions.map((s) => ({ key: s.id, at: s.startedAt, userId: s.userId, text: `concluiu ${s.name}`, sub: `${formatDuration(s.durationSeconds)} · ${s.sets} séries`, pr: false })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 4)

  return (
    <section className="card flex flex-col gap-1 p-5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="label-caps">Dupla · {campaign.name}</span>
        <Link to="/dupla" className="text-sm font-bold">Ver tudo</Link>
      </div>
      {items.length === 0 && <p className="py-3 text-sm text-muted">Nenhuma atividade ainda.</p>}
      {items.map((item) => (
        <div key={item.key} className="flex min-h-15 items-center gap-3 border-t border-[#232327]">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-extrabold ${avatar(item.userId === user?.id)}`}>
            {name(item.userId).charAt(0)}
          </span>
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-sm text-zinc-300"><b className="text-zinc-50">{name(item.userId)}</b> {item.text}</span>
            <span className="text-xs text-muted">{item.sub} · {new Date(item.at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
          </span>
          {item.pr && <span className="rounded-full bg-pr/16 px-2.5 py-1 text-xs font-bold text-purple-300">PR</span>}
        </div>
      ))}
    </section>
  )
}

export function HomePage() {
  const { user } = useAuth()
  const profile = useApi<ProfileResponse>('/profile')
  const diet = useApi<DayResponse>(`/diet/day/${todayIso()}`)
  const campaigns = useApi<{ campaigns: Campaign[] }>('/campaigns')
  const dateLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  if (profile.data && (!profile.data.profile || !profile.data.goal)) return <Navigate to="/perfil" replace />
  const goal = profile.data?.goal ?? null
  const weight = profile.data?.lastWeight?.weightKg ?? null
  const campaign = campaigns.data?.campaigns.at(-1)

  return (
    <Page wide>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-zinc-400 first-letter:uppercase">{dateLabel}</span>
          <h1 className="num text-4xl leading-none font-bold lg:text-5xl">Olá, {user?.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <SyncPill />
          <Link to="/perfil" aria-label="Perfil e metas" className="grid h-10 w-10 place-items-center rounded-full bg-lime-400 font-extrabold text-ink lg:hidden">
            {user?.name.charAt(0).toUpperCase()}
          </Link>
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="grid gap-5">
          <TodayWorkout />
          {profile.error && <p className="card p-5 text-sm text-zinc-400">Sem internet. Os treinos continuam funcionando.</p>}
          {diet.data && (
            <MacroBars title="Dieta de hoje" action={<Link to="/dieta" className="text-sm font-bold">Abrir diário</Link>} total={sum(diet.data.logs)} goal={goal} />
          )}
        </div>

        <div className="grid gap-5">
          {!profile.data && !profile.error && <Loading />}
          {goal && (
            <div className="grid grid-cols-2 gap-5">
              <Link to="/perfil" className="card flex flex-col gap-2.5 p-5">
                <span className="label-caps">Meta</span>
                <span className="text-[15px] font-semibold">{objectiveLabels[goal.objective]}</span>
                <span className="num text-4xl leading-none font-bold">
                  {goal.kcal.toLocaleString('pt-BR')}<span className="ml-1 text-base text-zinc-400">kcal/dia</span>
                </span>
                <span className="num text-[17px] text-zinc-400">
                  <b className="text-protein">{goal.proteinG}</b> P · <b className="text-indigo-300">{goal.carbsG}</b> C · <b className="text-fat">{goal.fatG}</b> G
                </span>
              </Link>
              <Link to="/progresso/corpo" className="card flex flex-col gap-2.5 p-5">
                <span className="label-caps">Peso</span>
                <span className="num mt-auto text-4xl leading-none font-bold">
                  {weight ? formatKg(weight) : '—'}<span className="ml-1 text-base text-zinc-400">kg</span>
                </span>
                {goal.targetWeightKg && weight && (
                  <span className="text-sm text-zinc-400">
                    Meta <b className="num text-[17px] text-zinc-50">{formatKg(goal.targetWeightKg)}</b> kg · faltam {formatKg(Math.round(Math.abs(weight - goal.targetWeightKg) * 10) / 10)}
                  </span>
                )}
              </Link>
            </div>
          )}
          <Link to="/ia/semana" className="card flex items-center justify-between gap-4 p-5">
            <span className="flex flex-col gap-1">
              <span className="label-caps">Assistente</span>
              <span className="text-[15px] font-semibold">Analisar minha semana</span>
              <span className="text-sm text-zinc-400">O que melhorar e o que fazer na próxima semana.</span>
            </span>
            <Icon name="chart" className="shrink-0 text-lime-400" />
          </Link>
          {campaign && <DuoFeed campaign={campaign} />}
        </div>
      </div>
    </Page>
  )
}
