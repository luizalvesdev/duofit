import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AppEnv } from './env'
import { auth } from './routes/auth'

const app = new Hono<AppEnv>()
  .use('*', cors({ origin: ['http://localhost:5173'] }))
  .get('/health', (c) => c.json({ ok: true }))
  .route('/auth', auth)

export type AppType = typeof app
export default app
