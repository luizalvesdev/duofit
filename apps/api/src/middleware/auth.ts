import { createMiddleware } from 'hono/factory'
import { verify } from 'hono/jwt'
import type { AppEnv } from '../env'

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer /, '')
  if (!token) return c.json({ error: 'unauthorized' }, 401)

  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    c.set('userId', payload.sub as string)
  } catch {
    return c.json({ error: 'unauthorized' }, 401)
  }

  await next()
})
