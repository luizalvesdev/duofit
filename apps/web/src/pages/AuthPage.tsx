import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { Button, ErrorText, Field, Input, PasswordInput } from '../components/ui'
import { ApiError } from '../lib/api'

const errorMessages: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_taken: 'Esse e-mail já tem conta.',
}

// Public demo account, filled by apps/api/seed/seed-demo.ts.
const DEMO_EMAIL = 'demo@duofit.demo'
const DEMO_PASSWORD = 'duofit-demo'

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isRegister = mode === 'register'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>
    await attempt(() =>
      isRegister ? register({ email: form.email, password: form.password, name: form.name }) : login(form.email, form.password),
    )
  }

  async function attempt(action: () => Promise<void>) {
    setError('')
    setSubmitting(true)
    try {
      await action()
    } catch (err) {
      setError(err instanceof ApiError ? (errorMessages[err.code] ?? 'Confira os dados.') : 'Sem conexão com o servidor.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-dvh grid place-items-center px-5">
      <form onSubmit={handleSubmit} className="w-full max-w-sm grid gap-4">
        <header className="mb-4 text-center">
          <h1 className="text-4xl font-black tracking-tight">
            Duo<span className="text-lime-400">Fit</span>
          </h1>
          <p className="mt-1 text-zinc-500">{isRegister ? 'Crie sua conta' : 'Bem-vindo de volta'}</p>
        </header>

        {isRegister && (
          <Field label="Nome">
            <Input name="name" required maxLength={60} autoComplete="given-name" />
          </Field>
        )}
        <Field label="E-mail">
          <Input name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label="Senha" hint={isRegister ? 'Mínimo de 8 caracteres' : undefined}>
          <PasswordInput
            name="password"
            required
            minLength={isRegister ? 8 : undefined}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
          />
        </Field>
        {!isRegister && (
          <Link to="/esqueci-senha" className="-mt-2 justify-self-end text-sm text-zinc-400">
            Esqueci a senha
          </Link>
        )}

        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Aguarde…' : isRegister ? 'Criar conta' : 'Entrar'}
        </Button>
        {!isRegister && (
          <button
            type="button"
            disabled={submitting}
            onClick={() => attempt(() => login(DEMO_EMAIL, DEMO_PASSWORD))}
            className="h-12 rounded-[14px] border border-line-strong px-5 font-bold text-zinc-200 transition hover:border-lime-400 active:scale-[0.98] disabled:opacity-50"
          >
            Ver demonstração
          </button>
        )}

        <p className="text-center text-sm text-zinc-500">
          {isRegister ? 'Já tem conta? ' : 'Primeira vez? '}
          <Link to={isRegister ? '/login' : '/cadastro'} className="text-lime-400">
            {isRegister ? 'Entrar' : 'Criar conta'}
          </Link>
        </p>
      </form>
    </main>
  )
}
