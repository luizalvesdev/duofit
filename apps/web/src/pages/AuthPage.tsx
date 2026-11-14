import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { Button, ErrorText, Field, Input } from '../components/ui'
import { ApiError } from '../lib/api'

const errorMessages: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  invalid_invite: 'Código de convite inválido.',
  email_taken: 'Esse e-mail já tem conta.',
}

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isRegister = mode === 'register'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>
    setError('')
    setSubmitting(true)
    try {
      if (isRegister) {
        await register({ email: form.email, password: form.password, name: form.name, inviteCode: form.inviteCode })
      } else {
        await login(form.email, form.password)
      }
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
          <Input
            name="password"
            type="password"
            required
            minLength={isRegister ? 8 : undefined}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
          />
        </Field>
        {isRegister && (
          <Field label="Código de convite">
            <Input name="inviteCode" required autoComplete="off" />
          </Field>
        )}

        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Aguarde…' : isRegister ? 'Criar conta' : 'Entrar'}
        </Button>

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
