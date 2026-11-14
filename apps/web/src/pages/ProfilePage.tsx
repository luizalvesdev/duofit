import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { Button, ErrorText, Field, Input, Select } from '../components/ui'
import { api } from '../lib/api'
import { activityLabels, ageFrom, kcalFromMacros, objectiveLabels, suggestTargets, todayIso } from '../lib/nutrition'
import type { ActivityLevel, Goal, Objective, ProfileResponse, Sex } from '../lib/types'

type Form = {
  sex: Sex
  birthDate: string
  heightCm: string
  weightKg: string
  activityLevel: ActivityLevel
  objective: Objective
  targetWeightKg: string
  targetDate: string
}

type Macros = { proteinG: number; carbsG: number; fatG: number }

const emptyForm: Form = {
  sex: 'male',
  birthDate: '',
  heightCm: '',
  weightKg: '',
  activityLevel: 'moderate',
  objective: 'lose',
  targetWeightKg: '',
  targetDate: '',
}

const goalChanged = (a: Goal | null, b: Goal) =>
  !a || (Object.keys(b) as (keyof Goal)[]).some((key) => a[key] !== b[key])

export function ProfilePage() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [form, setForm] = useState<Form>(emptyForm)
  const [current, setCurrent] = useState<ProfileResponse | null>(null)
  const [custom, setCustom] = useState<Macros | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api<ProfileResponse>('/profile').then((data) => {
      setCurrent(data)
      const { profile, goal, lastWeight } = data
      setForm((prev) => ({
        ...prev,
        ...(profile && {
          sex: profile.sex,
          birthDate: profile.birthDate,
          heightCm: String(profile.heightCm),
          activityLevel: profile.activityLevel,
        }),
        ...(lastWeight?.weightKg && { weightKg: String(lastWeight.weightKg) }),
        ...(goal && {
          objective: goal.objective,
          targetWeightKg: goal.targetWeightKg ? String(goal.targetWeightKg) : '',
          targetDate: goal.targetDate ?? '',
        }),
      }))
      if (goal) setCustom({ proteinG: goal.proteinG, carbsG: goal.carbsG, fatG: goal.fatG })
    })
  }, [])

  const suggestion = useMemo(() => {
    const heightCm = Number(form.heightCm)
    const weightKg = Number(form.weightKg)
    if (!form.birthDate || !heightCm || !weightKg) return null
    return suggestTargets({
      sex: form.sex,
      age: ageFrom(form.birthDate),
      heightCm,
      weightKg,
      activityLevel: form.activityLevel,
      objective: form.objective,
    })
  }, [form])

  const macros = custom ?? suggestion
  const kcal = macros ? kcalFromMacros(macros.proteinG, macros.carbsG, macros.fatG) : 0

  const update = <K extends keyof Form>(key: K) => (event: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value as Form[K] }))

  const updateMacro = (key: keyof Macros) => (event: { target: { value: string } }) =>
    setCustom((prev) => ({ ...(prev ?? suggestion!), [key]: Math.max(0, Number(event.target.value) || 0) }))

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!macros) return
    setError('')
    setSaving(true)
    try {
      await api('/profile', {
        method: 'PUT',
        body: {
          sex: form.sex,
          birthDate: form.birthDate,
          heightCm: Number(form.heightCm),
          activityLevel: form.activityLevel,
          weightKg: Number(form.weightKg),
          today: todayIso(),
        },
      })

      const goal: Goal = {
        objective: form.objective,
        targetWeightKg: form.targetWeightKg ? Number(form.targetWeightKg) : null,
        targetDate: form.targetDate || null,
        kcal,
        ...macros,
      }
      if (goalChanged(current?.goal ?? null, goal)) await api('/profile/goals', { method: 'POST', body: goal })

      navigate('/')
    } catch {
      setError('Não foi possível salvar. Confira os dados.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <h1 className="num text-4xl leading-none font-bold uppercase lg:text-5xl">Seu perfil</h1>
      <p className="mb-6 text-zinc-500">Usado para calcular suas calorias e macros.</p>

      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sexo">
            <Select value={form.sex} onChange={update('sex')}>
              <option value="male">Masculino</option>
              <option value="female">Feminino</option>
            </Select>
          </Field>
          <Field label="Nascimento">
            <Input type="date" required value={form.birthDate} onChange={update('birthDate')} max={todayIso()} />
          </Field>
          <Field label="Altura (cm)">
            <Input type="number" inputMode="numeric" required min={100} max={250} value={form.heightCm} onChange={update('heightCm')} />
          </Field>
          <Field label="Peso atual (kg)">
            <Input type="number" inputMode="decimal" step="0.1" required min={30} max={300} value={form.weightKg} onChange={update('weightKg')} />
          </Field>
        </div>

        <Field label="Nível de atividade">
          <Select value={form.activityLevel} onChange={update('activityLevel')}>
            {Object.entries(activityLabels).map(([value, { label }]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </Field>

        <h2 className="mt-4 text-lg font-semibold">Meta</h2>

        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(objectiveLabels) as Objective[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setForm((prev) => ({ ...prev, objective: value }))
                setCustom(null)
              }}
              className={`rounded-xl border px-2 py-3 text-sm transition ${
                form.objective === value ? 'border-lime-400 bg-lime-400/10 text-lime-300' : 'border-zinc-800 text-zinc-400'
              }`}
            >
              {objectiveLabels[value]}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Peso alvo (kg)">
            <Input type="number" inputMode="decimal" step="0.1" min={30} max={300} value={form.targetWeightKg} onChange={update('targetWeightKg')} />
          </Field>
          <Field label="Até quando">
            <Input type="date" value={form.targetDate} onChange={update('targetDate')} min={todayIso()} />
          </Field>
        </div>

        {suggestion && macros && (
          <section className="mt-2 grid gap-4 card p-4">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-sm text-zinc-500">Meta diária</p>
                <p className="text-3xl font-black">{kcal} <span className="text-base font-normal text-zinc-500">kcal</span></p>
              </div>
              <p className="text-right text-xs text-zinc-500">
                Basal {suggestion.bmr} kcal
                <br />
                Gasto {suggestion.tdee} kcal
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {([['proteinG', 'Proteína'], ['carbsG', 'Carbo'], ['fatG', 'Gordura']] as const).map(([key, label]) => (
                <Field key={key} label={`${label} (g)`}>
                  <Input type="number" inputMode="numeric" min={0} value={macros[key]} onChange={updateMacro(key)} />
                </Field>
              ))}
            </div>

            {custom && (
              <button type="button" onClick={() => setCustom(null)} className="text-left text-sm text-lime-400">
                Voltar para a sugestão ({suggestion.kcal} kcal)
              </button>
            )}
          </section>
        )}

        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={saving || !macros} className="mt-2">
          {saving ? 'Salvando…' : 'Salvar'}
        </Button>
      </form>
      {current?.profile && (
        <button onClick={logout} className="mt-2 py-3 text-sm font-semibold text-red-400">Sair da conta</button>
      )}
    </main>
  )
}
