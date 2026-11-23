import { useLiveQuery } from 'dexie-react-hooks'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { ExerciseThumb } from '../components/ExercisePicker'
import { Icon } from '../components/Icon'
import { db } from '../lib/db'
import { startSession } from '../lib/session'
import { weekdayLabels } from '../lib/workout'

// Read-only look at a ficha. Nothing is created until the user taps "Começar".
export function TemplatePreviewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const template = useLiveQuery(() => db.templates.get(id ?? '').then((t) => t ?? null), [id])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], [])
  const active = useLiveQuery(() => db.active.get('active'), [])

  if (template === undefined) return null
  if (template === null) return <Navigate to="/treinos" replace />

  const byId = new Map(exercises.map((e) => [e.id, e]))

  async function start() {
    if (!template) return
    if (active && active.templateId !== template.id && !confirm('Já existe um treino em andamento. Descartar e começar outro?')) return
    if (!active || active.templateId !== template.id) await startSession(template)
    navigate('/treino')
  }

  return (
    <main className="mx-auto grid max-w-md gap-5 px-4 py-6 pb-32 sm:px-6 lg:max-w-3xl lg:px-12 lg:py-10">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate('/treinos')} aria-label="Voltar" className="grid h-12 w-12 place-items-center rounded-[14px] border border-line-strong bg-surface-2">
          <Icon name="back" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="num truncate text-3xl leading-none font-bold uppercase">{template.name}</h1>
          <p className="text-sm text-zinc-500">
            {template.weekdays.length ? template.weekdays.map((d) => weekdayLabels[d]).join(' · ') : 'Sem dia fixo'}
          </p>
        </div>
        <Link to={`/treinos/${template.id}`} className="text-sm text-zinc-400">Editar</Link>
      </header>

      <ul className="grid gap-3">
        {template.items.map((item, index) => {
          const exercise = byId.get(item.exerciseId)
          return (
            <li key={`${item.exerciseId}-${index}`} className="card flex items-center gap-3 p-3">
              {exercise && <ExerciseThumb exercise={exercise} />}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{exercise?.name ?? '…'}</p>
                <p className="text-sm text-zinc-400">
                  {item.targetSets} × {item.repMin === item.repMax ? item.repMin : `${item.repMin}–${item.repMax}`} · descanso {item.restSeconds}s
                </p>
                {item.notes && <p className="text-xs text-zinc-500">{item.notes}</p>}
              </div>
            </li>
          )
        })}
      </ul>

      <button onClick={start} className="flex h-14 items-center justify-center gap-2 rounded-[14px] bg-lime-400 text-lg font-extrabold text-ink">
        <Icon name="play" size={20} />
        {active?.templateId === template.id ? 'Continuar treino' : 'Começar treino'}
      </button>
    </main>
  )
}
