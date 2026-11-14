import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router'
import { Icon } from '../../components/Icon'
import { db } from '../../lib/db'
import { ExerciseDetail } from './ExerciseDetail'

export function ExerciseProgressPage({ basePath = '/progress' }: { basePath?: string }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const exercise = useLiveQuery(() => db.exercises.get(id!), [id])

  return (
    <main className="mx-auto grid max-w-md gap-5 px-4 py-6 sm:px-6 lg:max-w-3xl lg:px-12 lg:py-10">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 justify-self-start font-semibold text-zinc-400"><Icon name="back" size={18} />Voltar</button>
      <ExerciseDetail exerciseId={id!} basePath={basePath} exercise={exercise} />
    </main>
  )
}
