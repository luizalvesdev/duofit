import { useNavigate, useParams } from 'react-router'
import { ExerciseProgressPage } from '../progress/ExerciseProgressPage'
import { RecordsTab } from '../progress/RecordsTab'
import { SessionDetailPage } from '../progress/SessionDetailPage'

const useBase = () => {
  const { campaignId, userId } = useParams()
  return { api: `/campaigns/${campaignId}/members/${userId}`, link: `/dupla/${campaignId}/${userId}` }
}

export function MemberSessionPage() {
  return <SessionDetailPage basePath={useBase().api} />
}

export function MemberExercisePage() {
  return <ExerciseProgressPage basePath={useBase().api} />
}

export function MemberRecordsPage() {
  const base = useBase()
  const navigate = useNavigate()
  return (
    <main className="mx-auto grid max-w-md gap-4 px-5 py-8">
      <button onClick={() => navigate(-1)} className="justify-self-start text-zinc-400">Voltar</button>
      <h1 className="text-2xl font-bold">Recordes</h1>
      <RecordsTab basePath={base.api} linkBase={`${base.link}/exercicio`} />
    </main>
  )
}
