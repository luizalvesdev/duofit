import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { api } from '../lib/api'
import { objectiveLabels } from '../lib/nutrition'
import type { ProfileResponse } from '../lib/types'

export function HomePage() {
  const { user, logout } = useAuth()
  const [data, setData] = useState<ProfileResponse | null>(null)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    api<ProfileResponse>('/profile').then(setData).catch(() => setOffline(true))
  }, [])

  if (offline) {
    return (
      <main className="mx-auto grid min-h-[70dvh] max-w-md place-content-center gap-3 px-5 text-center">
        <p className="text-zinc-400">Sem internet. Os treinos continuam funcionando.</p>
        <Link to="/treinos" className="text-lime-400">Ir para os treinos</Link>
      </main>
    )
  }

  if (!data) return <div className="min-h-dvh grid place-items-center text-zinc-500">Carregando…</div>
  if (!data.profile || !data.goal) return <Navigate to="/perfil" replace />

  const { goal, lastWeight } = data

  return (
    <main className="mx-auto max-w-md px-5 py-8 grid gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Olá, {user?.name}</h1>
        <button onClick={logout} className="text-sm text-zinc-500">Sair</button>
      </header>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 grid gap-3">
        <p className="text-sm text-zinc-500">{objectiveLabels[goal.objective]}</p>
        <p className="text-3xl font-black">{goal.kcal} <span className="text-base font-normal text-zinc-500">kcal/dia</span></p>
        <div className="grid grid-cols-3 text-center text-sm">
          <div><p className="text-lg font-semibold">{goal.proteinG}g</p><p className="text-zinc-500">Proteína</p></div>
          <div><p className="text-lg font-semibold">{goal.carbsG}g</p><p className="text-zinc-500">Carbo</p></div>
          <div><p className="text-lg font-semibold">{goal.fatG}g</p><p className="text-zinc-500">Gordura</p></div>
        </div>
      </section>

      {lastWeight?.weightKg && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 flex justify-between">
          <div>
            <p className="text-sm text-zinc-500">Peso atual</p>
            <p className="text-2xl font-bold">{lastWeight.weightKg} kg</p>
          </div>
          {goal.targetWeightKg && (
            <div className="text-right">
              <p className="text-sm text-zinc-500">Meta</p>
              <p className="text-2xl font-bold text-lime-400">{goal.targetWeightKg} kg</p>
            </div>
          )}
        </section>
      )}

      <Link to="/perfil" className="text-center text-sm text-lime-400">Editar perfil e meta</Link>
    </main>
  )
}
