import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AppEnv } from './env'
import { auth } from './routes/auth'
import { dietRoutes } from './routes/diet'
import { exerciseRoutes } from './routes/exercises'
import { profile } from './routes/profile'
import { progressRoutes } from './routes/progress'
import { sessionRoutes } from './routes/sessions'
import { templateRoutes } from './routes/templates'

const app = new Hono<AppEnv>()
  .use('*', cors({ origin: ['http://localhost:5173'], allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }))
  .get('/health', (c) => c.json({ ok: true }))
  .route('/auth', auth)
  .route('/profile', profile)
  .route('/exercises', exerciseRoutes)
  .route('/templates', templateRoutes)
  .route('/sessions', sessionRoutes)
  .route('/progress', progressRoutes)
  .route('/diet', dietRoutes)

export type AppType = typeof app
export default app
