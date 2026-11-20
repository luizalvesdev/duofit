import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { Button, ErrorText, Field, Input, PasswordInput } from '../components/ui'
import { api, ApiError } from '../lib/api'

function AuthShell({ subtitle, children }: { subtitle: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh grid place-items-center px-5">
      <div className="w-full max-w-sm grid gap-4">
        <header className="mb-4 text-center">
          <h1 className="text-4xl font-black tracking-tight">
            Duo<span className="text-lime-400">Fit</span>
          </h1>
          <p className="mt-1 text-zinc-500">{subtitle}</p>
        </header>
        {children}
      </div>
    </main>
  )
}

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get('email') ?? '')
    setError('')
    setSubmitting(true)
    try {
      await api('/auth/forgot', { method: 'POST', body: { email } })
      setSentTo(email)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code === 'email_unavailable'
            ? 'Envio de e-mail indisponível no momento.'
            : 'Confira o e-mail digitado.'
          : 'Sem conexão com o servidor.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (sentTo) {
    return (
      <AuthShell subtitle="Confira seu e-mail">
        <p className="card p-5 text-center text-sm leading-relaxed text-zinc-300">
          Se existir uma conta com <b className="text-zinc-50">{sentTo}</b>, enviamos um link para criar uma nova senha. Ele vale por 1 hora.
          <br />
          <span className="text-zinc-500">Não chegou? Olhe a caixa de spam.</span>
        </p>
        <Link to="/login" className="text-center text-sm text-lime-400">Voltar para o login</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell subtitle="Esqueceu a senha?">
      <form onSubmit={handleSubmit} className="grid gap-4">
        <p className="text-sm text-zinc-400">Digite o e-mail da sua conta e enviaremos um link para criar uma nova senha.</p>
        <Field label="E-mail">
          <Input name="email" type="email" required autoComplete="email" autoFocus />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={submitting}>{submitting ? 'Enviando…' : 'Enviar link'}</Button>
        <Link to="/login" className="text-center text-sm text-zinc-500">Voltar para o login</Link>
      </form>
    </AuthShell>
  )
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { resetPassword } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') ?? '')
    if (password !== form.get('confirm')) return setError('As senhas não conferem.')
    setError('')
    setSubmitting(true)
    try {
      await resetPassword(token, password)
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'invalid_token') setExpired(true)
      else setError(err instanceof ApiError ? 'Confira a nova senha.' : 'Sem conexão com o servidor.')
      setSubmitting(false)
    }
  }

  if (!token || expired) {
    return (
      <AuthShell subtitle="Link inválido">
        <p className="card p-5 text-center text-sm leading-relaxed text-zinc-300">
          Este link expirou ou já foi usado. Peça um novo para redefinir a senha.
        </p>
        <Link to="/esqueci-senha" className="text-center text-sm text-lime-400">Pedir novo link</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell subtitle="Crie uma nova senha">
      <form onSubmit={handleSubmit} className="grid gap-4">
        <Field label="Nova senha" hint="Mínimo de 8 caracteres">
          <PasswordInput name="password" required minLength={8} autoComplete="new-password" autoFocus />
        </Field>
        <Field label="Repita a nova senha">
          <PasswordInput name="confirm" required minLength={8} autoComplete="new-password" />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={submitting}>{submitting ? 'Salvando…' : 'Salvar e entrar'}</Button>
      </form>
    </AuthShell>
  )
}
