import { useState } from 'react'
import { api } from '../lib/api'
import { Button, ErrorText } from './ui'

export function AiConsent({ onAccepted }: { onAccepted: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function accept() {
    setSaving(true)
    try {
      await api('/ai/profile', { method: 'PUT', body: { consent: true } })
      onAccepted()
    } catch {
      setError('Não foi possível salvar. Tente de novo.')
      setSaving(false)
    }
  }

  return (
    <section className="card grid gap-4 p-6">
      <span className="label-caps">Antes de começar</span>
      <h2 className="num text-2xl font-bold">Assistente com IA</h2>
      <div className="grid gap-2 text-sm leading-relaxed text-zinc-400">
        <p>Para gerar análises e sugestões, o DuoFit envia a um modelo de IA (Claude, da Anthropic, via Amazon Bedrock) um resumo dos seus números: treinos, dieta, peso e respostas do questionário.</p>
        <p>Nome, e-mail e identificadores não são enviados. Você pode revogar o consentimento quando quiser.</p>
        <p>A IA só sugere. Ela não é personal trainer nem nutricionista, e nada muda no seu app sem você aprovar.</p>
      </div>
      <ErrorText>{error}</ErrorText>
      <Button onClick={accept} disabled={saving}>Aceitar e continuar</Button>
    </section>
  )
}
