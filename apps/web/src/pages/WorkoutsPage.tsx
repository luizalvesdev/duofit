import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router'
import { db } from '../lib/db'
import { startSession } from '../lib/session'
import { weekdayLabels, type Template } from '../lib/workout'

export function WorkoutsPage() {
  const navigate = useNavigate()
  const templates = useLiveQuery(() => db.templates.toArray(), [], [])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [])
  const active = useLiveQuery(() => db.active.get('active'), [])
  const pending = useLiveQuery(() => db.outbox.count(), [], 0)
  const today = new Date().getDay()
  const names = new Map(exercises.map((e) => [e.id, e.name]))

  async function start(template: Template) {
    if (active && !confirm('Já existe um treino em andamento. Descartar e começar outro?')) return
    await startSession(template)
    navigate('/treino')
  }

  const sorted = [...templates].sort(
    (a, b) => Number(b.weekdays.includes(today)) - Number(a.weekdays.includes(today)) || a.name.localeCompare(b.name),
  )

  return (
    <main className="mx-auto grid max-w-md gap-5 px-4 py-6 sm:px-6 lg:max-w-3xl lg:px-12 lg:py-10">
      <header className="flex items-center justify-between">
        <h1 className="num text-4xl leading-none font-bold uppercase lg:text-5xl">Treinos</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link to="/ia/treino" className="text-zinc-300">Montar com IA</Link>
          <Link to="/treinos/nova" className="text-lime-400">+ Nova ficha</Link>
        </div>
      </header>

      {pending > 0 && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          {pending} treino(s) aguardando internet para sincronizar.
        </p>
      )}

      {active && (
        <Link to="/treino" className="rounded-2xl bg-lime-400 p-4 text-ink">
          <p className="text-sm font-medium opacity-70">Em andamento</p>
          <p className="text-lg font-bold">{active.name} — continuar</p>
        </Link>
      )}

      {sorted.map((template) => (
        <section key={template.id} className="grid gap-3 card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{template.name}</h2>
              <p className="text-sm text-zinc-500">
                {template.weekdays.length
                  ? template.weekdays.map((d) => weekdayLabels[d]).join(' · ')
                  : 'Sem dia fixo'}
                {template.weekdays.includes(today) && <span className="ml-2 text-lime-400">hoje</span>}
              </p>
            </div>
            <Link to={`/treinos/${template.id}`} className="text-sm text-zinc-400">Editar</Link>
          </div>
          <p className="text-sm text-zinc-400">
            {template.items.map((item) => names.get(item.exerciseId) ?? '…').join(', ')}
          </p>
          <button onClick={() => start(template)} className="rounded-xl bg-zinc-800 py-3 font-semibold text-lime-400">
            Começar
          </button>
        </section>
      ))}

      {templates.length === 0 && (
        <p className="py-6 text-center text-zinc-500">Nenhuma ficha ainda. Crie a primeira para começar a treinar.</p>
      )}
    </main>
  )
}
