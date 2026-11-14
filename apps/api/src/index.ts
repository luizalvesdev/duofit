import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AppEnv } from './env'
import { auth } from './routes/auth'
import { profile } from './routes/profile'

const app = new Hono<AppEnv>()
  .use('*', cors({ origin: ['http://localhost:5173'], allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }))
  .get('/health', (c) => c.json({ ok: true }))
  .route('/auth', auth)
  .route('/profile', profile)

export type AppType = typeof app
export default app
