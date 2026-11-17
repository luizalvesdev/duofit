import { WorkerMailer } from 'worker-mailer'
import type { Bindings } from '../env'

export const mailConfigured = (env: Bindings) => Boolean(env.SMTP_USER && env.SMTP_PASS)

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)

/** Sends through Gmail SMTP (implicit TLS on 465) using an app password. */
async function send(env: Bindings, to: { name: string; email: string }, subject: string, text: string, html: string) {
  await WorkerMailer.send(
    {
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      authType: 'plain',
      credentials: { username: env.SMTP_USER!, password: env.SMTP_PASS! },
    },
    { from: { name: 'DuoFit', email: env.SMTP_USER! }, to, subject, text, html },
  )
}

export async function sendPasswordReset(env: Bindings, to: { name: string; email: string }, link: string) {
  const name = to.name.split(' ')[0]
  const text = [
    `Olá, ${name}!`,
    '',
    'Recebemos um pedido para redefinir a senha da sua conta no DuoFit.',
    `Abra este link para criar uma nova senha (vale por 1 hora): ${link}`,
    '',
    'Se não foi você, ignore este e-mail; sua senha continua a mesma.',
  ].join('\n')

  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;background:#09090b;font-family:Arial,Helvetica,sans-serif;color:#fafafa">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px">
    <p style="font-size:28px;font-weight:700;margin:0 0 24px">Duo<span style="color:#a3e635">Fit</span></p>
    <p style="font-size:16px;margin:0 0 12px">Olá, ${escapeHtml(name)}!</p>
    <p style="font-size:15px;line-height:1.5;color:#d4d4d8;margin:0 0 24px">Recebemos um pedido para redefinir a senha da sua conta. O link vale por 1 hora.</p>
    <a href="${escapeHtml(link)}" style="display:inline-block;background:#a3e635;color:#0b0f02;font-weight:700;font-size:15px;text-decoration:none;padding:14px 22px;border-radius:14px">Criar nova senha</a>
    <p style="font-size:13px;line-height:1.5;color:#8b8b94;margin:24px 0 0">Se não foi você, ignore este e-mail; sua senha continua a mesma.</p>
  </div>
</body></html>`

  await send(env, to, 'Redefinir sua senha do DuoFit', text, html)
}
