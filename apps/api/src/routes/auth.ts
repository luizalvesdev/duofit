import { zValidator } from '@hono/zod-validator'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { createDb } from '../db/client'
import { passwordResets, users } from '../db/schema'
import type { AppEnv } from '../env'
import { mailConfigured, sendPasswordReset } from '../lib/mail'
import { hashPassword, verifyPassword } from '../lib/password'
import { issueToken } from '../lib/token'
import { requireAuth } from '../middleware/auth'
import { createDefaultMeals } from './diet'

const email = z.email().transform((value) => value.trim().toLowerCase())

const registerSchema = z.object({
  email,
  password: z.string().min(8),
  name: z.string().trim().min(1).max(60),
})

const loginSchema = z.object({ email, password: z.string() })

const RESET_TTL_MS = 60 * 60 * 1000
const RESET_COOLDOWN_MS = 60 * 1000

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const publicUser = { id: users.id, email: users.email, name: users.name }

export const auth = new Hono<AppEnv>()
  .post('/register', zValidator('json', registerSchema), async (c) => {
    const body = c.req.valid('json')
    const db = createDb(c.env.DATABASE_URL)
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email))
    if (existing) return c.json({ error: 'email_taken' }, 409)

    const [user] = await db
      .insert(users)
      .values({ email: body.email, name: body.name, passwordHash: await hashPassword(body.password) })
      .returning(publicUser)
    await createDefaultMeals(db, user.id)

    return c.json({ user, token: await issueToken(user.id, c.env.JWT_SECRET) }, 201)
  })
  .post('/login', zValidator('json', loginSchema), async (c) => {
    const body = c.req.valid('json')
    const db = createDb(c.env.DATABASE_URL)
    const [row] = await db.select().from(users).where(eq(users.email, body.email))

    if (!row || !(await verifyPassword(body.password, row.passwordHash))) {
      return c.json({ error: 'invalid_credentials' }, 401)
    }

    const user = { id: row.id, email: row.email, name: row.name }
    return c.json({ user, token: await issueToken(user.id, c.env.JWT_SECRET) })
  })
  .post('/forgot', zValidator('json', z.object({ email })), async (c) => {
    if (!mailConfigured(c.env)) return c.json({ error: 'email_unavailable' }, 503)
    const db = createDb(c.env.DATABASE_URL)
    const [user] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.email, c.req.valid('json').email))

    // Demo accounts (seed/seed-demo.ts) use an undeliverable domain: never e-mail them.
    if (user && !user.email.endsWith('@duofit.demo')) {
      const [recent] = await db
        .select({ id: passwordResets.id })
        .from(passwordResets)
        .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt), gt(passwordResets.createdAt, new Date(Date.now() - RESET_COOLDOWN_MS))))
      if (!recent) {
        const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
        await db.insert(passwordResets).values({ userId: user.id, tokenHash: await sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) })
        const link = `${c.env.APP_URL}/redefinir-senha?token=${token}`
        // Sent after responding, so the reply is identical whether or not the e-mail exists.
        c.executionCtx.waitUntil(sendPasswordReset(c.env, user, link).catch((error) => console.error('password reset e-mail failed', error)))
      }
    }
    return c.json({ ok: true })
  })
  .post('/reset', zValidator('json', z.object({ token: z.string().min(20).max(200), password: z.string().min(8) })), async (c) => {
    const { token, password } = c.req.valid('json')
    const db = createDb(c.env.DATABASE_URL)
    const now = new Date()
    // Claiming the token and checking it in one statement makes it single-use even under concurrent requests.
    const [reset] = await db
      .update(passwordResets)
      .set({ usedAt: now })
      .where(and(eq(passwordResets.tokenHash, await sha256(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, now)))
      .returning({ userId: passwordResets.userId })
    if (!reset) return c.json({ error: 'invalid_token' }, 400)

    const [user] = await db
      .update(users)
      .set({ passwordHash: await hashPassword(password) })
      .where(eq(users.id, reset.userId))
      .returning(publicUser)
    await db.delete(passwordResets).where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)))
    return c.json({ user, token: await issueToken(user.id, c.env.JWT_SECRET) })
  })
  .get('/me', requireAuth, async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const [user] = await db.select(publicUser).from(users).where(eq(users.id, c.get('userId')))
    if (!user) return c.json({ error: 'unauthorized' }, 401)
    return c.json({ user })
  })
