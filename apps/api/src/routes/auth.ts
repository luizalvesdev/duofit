import { zValidator } from '@hono/zod-validator'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { createDb } from '../db/client'
import { users } from '../db/schema'
import type { AppEnv } from '../env'
import { hashPassword, verifyPassword } from '../lib/password'
import { issueToken } from '../lib/token'
import { requireAuth } from '../middleware/auth'

const email = z.email().transform((value) => value.trim().toLowerCase())

const registerSchema = z.object({
  email,
  password: z.string().min(8),
  name: z.string().trim().min(1).max(60),
  inviteCode: z.string(),
})

const loginSchema = z.object({ email, password: z.string() })

const publicUser = { id: users.id, email: users.email, name: users.name }

export const auth = new Hono<AppEnv>()
  .post('/register', zValidator('json', registerSchema), async (c) => {
    const body = c.req.valid('json')
    if (body.inviteCode !== c.env.INVITE_CODE) return c.json({ error: 'invalid_invite' }, 403)

    const db = createDb(c.env.DATABASE_URL)
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email))
    if (existing) return c.json({ error: 'email_taken' }, 409)

    const [user] = await db
      .insert(users)
      .values({ email: body.email, name: body.name, passwordHash: await hashPassword(body.password) })
      .returning(publicUser)

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
  .get('/me', requireAuth, async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const [user] = await db.select(publicUser).from(users).where(eq(users.id, c.get('userId')))
    if (!user) return c.json({ error: 'unauthorized' }, 401)
    return c.json({ user })
  })
