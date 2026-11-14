import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthContext'
import { Button, ErrorText, Field, Input } from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { todayIso } from '../../lib/nutrition'
import { Loading, Offline, useApi } from '../../lib/useApi'
import { SessionCard } from '../progress/HistoryTab'
import { RecordLine } from '../progress/RecordsTab'
import type { Campaign, Feed } from './types'

const formatDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

function Setup({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [startsOn, setStartsOn] = useState(todayIso())
  const [endsOn, setEndsOn] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  async function create() {
    if (name.trim().length < 2) return setError('Dê um nome para a campanha.')
    try {
      await api('/campaigns', { method: 'POST', body: { name, startsOn, endsOn: endsOn || null } })
      onDone()
    } catch {
      setError('Não foi possível criar. Confira as datas.')
    }
  }

  async function join() {
    try {
      await api('/campaigns/join', { method: 'POST', body: { code } })
      onDone()
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'invalid_code' ? 'Código não encontrado.' : 'Não foi possível entrar.')
    }
  }

  return (
    <div className="grid gap-6">
      <p className="text-zinc-400">Treinem juntos: numa campanha cada um vê os treinos, PRs, metas e medidas do outro. A dieta só aparece se a pessoa liberar.</p>
      <section className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="font-semibold">Criar campanha</h2>
        <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Projeto verão 2027" maxLength={60} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Início"><Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} /></Field>
          <Field label="Fim (opcional)"><Input type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} /></Field>
        </div>
        <Button onClick={create}>Criar</Button>
      </section>
      <section className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="font-semibold">Entrar com código</h2>
        <div className="flex gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC234" maxLength={6} />
          <Button onClick={join} disabled={code.length !== 6}>Entrar</Button>
        </div>
      </section>
      <ErrorText>{error}</ErrorText>
    </div>
  )
}

function CampaignView({ campaign, onChange }: { campaign: Campaign; onChange: () => void }) {
  const { user } = useAuth()
  const feed = useApi<Feed>(`/campaigns/${campaign.id}/feed`)
  const me = campaign.members.find((m) => m.userId === user?.id)
  const names = new Map(campaign.members.map((m) => [m.userId, m.userId === user?.id ? 'Você' : m.name]))
  const [copied, setCopied] = useState(false)

  async function toggleDiet() {
    await api(`/campaigns/${campaign.id}/me`, { method: 'PATCH', body: { shareDiet: !me?.shareDiet } })
    onChange()
  }

  async function leave() {
    if (!confirm('Sair da campanha? Seus dados continuam salvos, só deixam de ser compartilhados.')) return
    await api(`/campaigns/${campaign.id}/me`, { method: 'DELETE' })
    onChange()
  }

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div>
          <h2 className="text-xl font-bold">{campaign.name}</h2>
          <p className="text-sm text-zinc-500">
            {formatDate(campaign.startsOn)}{campaign.endsOn && ` → ${formatDate(campaign.endsOn)}`}
          </p>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-zinc-950 px-3 py-2">
          <span className="text-sm text-zinc-400">Código de convite</span>
          <button
            onClick={() => navigator.clipboard?.writeText(campaign.inviteCode).then(() => setCopied(true))}
            className="font-mono text-lg font-bold tracking-widest text-lime-400"
          >
            {campaign.inviteCode} <span className="text-xs font-normal text-zinc-500">{copied ? 'copiado' : 'copiar'}</span>
          </button>
        </div>
        <label className="flex items-center justify-between text-sm">
          <span>Compartilhar minha dieta</span>
          <input type="checkbox" checked={me?.shareDiet ?? false} onChange={toggleDiet} className="h-5 w-5 accent-lime-400" />
        </label>
      </section>

      <section className="grid grid-cols-2 gap-3">
        {campaign.members.map((m) => (
          <Link
            key={m.userId}
            to={m.userId === user?.id ? '/progresso' : `/dupla/${campaign.id}/${m.userId}`}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-center"
          >
            <p className="text-3xl">{m.userId === user?.id ? '🙋' : '💪'}</p>
            <p className="font-semibold">{names.get(m.userId)}</p>
            <p className="text-xs text-zinc-500">{m.userId === user?.id ? 'ver meu progresso' : 'ver progresso'}</p>
          </Link>
        ))}
        {campaign.members.length < 2 && (
          <div className="grid place-content-center rounded-2xl border border-dashed border-zinc-700 p-4 text-center text-sm text-zinc-500">
            Passe o código para o seu par entrar
          </div>
        )}
      </section>

      <h2 className="font-semibold">Atividade</h2>
      {feed.error && <Offline />}
      {!feed.data && !feed.error && <Loading />}
      {feed.data && feed.data.records.length > 0 && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h3 className="mb-1 text-sm font-semibold">🏆 PRs</h3>
          {feed.data.records.slice(0, 8).map((r) => <RecordLine key={r.id} record={r} who={names.get(r.userId)} />)}
        </section>
      )}
      {feed.data?.sessions.map((s) => (
        <div key={s.id} className="grid gap-1">
          <p className="text-xs text-lime-400">{names.get(s.userId)}</p>
          <SessionCard
            session={s}
            to={s.userId === user?.id ? `/progresso/treino/${s.id}` : `/dupla/${campaign.id}/${s.userId}/treino/${s.id}`}
          />
        </div>
      ))}
      {feed.data && feed.data.sessions.length === 0 && <p className="py-6 text-center text-zinc-500">Nenhum treino ainda. Bora!</p>}

      <button onClick={leave} className="py-2 text-sm text-red-400">Sair da campanha</button>
    </div>
  )
}

export function DuoPage() {
  const { data, error, reload } = useApi<{ campaigns: Campaign[] }>('/campaigns')
  const campaign = data?.campaigns.at(-1)

  return (
    <main className="mx-auto grid max-w-md gap-4 px-5 py-8">
      <h1 className="text-2xl font-bold">Dupla</h1>
      {error && <Offline />}
      {!data && !error && <Loading />}
      {data && (campaign ? <CampaignView campaign={campaign} onChange={reload} /> : <Setup onDone={reload} />)}
    </main>
  )
}
