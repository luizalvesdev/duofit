import { zValidator } from '@hono/zod-validator'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { z } from 'zod'
import { createDb } from '../db/client'
import { aiInsights, campaignMembers, campaigns, users } from '../db/schema'
import type { AppEnv } from '../env'
import { applyDuoDietDraft } from '../lib/ai/apply'
import { AiError, HttpError } from '../lib/ai/errors'
import { currentGoal, exerciseBests, exerciseProgress, listBodyLogs, listSessions, recentRecords, sessionDetail } from '../lib/stats'
import { requireAuth } from '../middleware/auth'
import { loadDiary, mealsForDay } from './diet'

type Db = ReturnType<typeof createDb>
type MemberEnv = AppEnv & { Variables: AppEnv['Variables'] & { targetId: string; targetSharesDiet: boolean } }

const isoDate = z.iso.date()
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const newCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')

async function membersOf(db: Db, campaignIds: string[]) {
  if (campaignIds.length === 0) return []
  return db
    .select({ campaignId: campaignMembers.campaignId, userId: users.id, name: users.name, shareDiet: campaignMembers.shareDiet })
    .from(campaignMembers)
    .innerJoin(users, eq(users.id, campaignMembers.userId))
    .where(inArray(campaignMembers.campaignId, campaignIds))
    .orderBy(asc(campaignMembers.joinedAt))
}

async function isMember(db: Db, campaignId: string, userId: string) {
  const [row] = await db
    .select({ shareDiet: campaignMembers.shareDiet })
    .from(campaignMembers)
    .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)))
  return row ?? null
}

// Both the viewer and the person being viewed must belong to the campaign.
const requireSharedCampaign = createMiddleware<MemberEnv>(async (c, next) => {
  const db = createDb(c.env.DATABASE_URL)
  const campaignId = c.req.param('id')!
  const targetId = c.req.param('userId')!
  const [viewer, target] = await Promise.all([isMember(db, campaignId, c.get('userId')), isMember(db, campaignId, targetId)])
  if (!viewer || !target) return c.json({ error: 'not_found' }, 404)
  c.set('targetId', targetId)
  c.set('targetSharesDiet', target.shareDiet)
  await next()
})

const member = new Hono<MemberEnv>()
  .use(requireSharedCampaign)
  .get('/', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const targetId = c.get('targetId')
    const since = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10)
    const [[user], goal, body, sessions, bests] = await Promise.all([
      db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, targetId)),
      currentGoal(db, targetId),
      listBodyLogs(db, targetId, since),
      listSessions(db, targetId, { limit: 10 }),
      exerciseBests(db, targetId),
    ])
    // Diet is always shared between campaign members, so the partner's diet is never hidden.
    return c.json({ user, goal, body, sessions, bests, sharesDiet: true })
  })
  .get('/sessions/:sessionId', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const detail = await sessionDetail(db, c.get('targetId'), c.req.param('sessionId'))
    return detail ? c.json(detail) : c.json({ error: 'not_found' }, 404)
  })
  .get('/exercises', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const targetId = c.get('targetId')
    const [bests, records] = await Promise.all([exerciseBests(db, targetId), recentRecords(db, [targetId], 10)])
    return c.json({ bests, records })
  })
  .get('/exercises/:exerciseId', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    return c.json({ points: await exerciseProgress(db, c.get('targetId'), c.req.param('exerciseId')) })
  })
  .get('/diet/:date', async (c) => {
    const date = isoDate.safeParse(c.req.param('date'))
    if (!date.success) return c.json({ error: 'invalid_date' }, 400)
    const db = createDb(c.env.DATABASE_URL)
    const targetId = c.get('targetId')
    const [logs, goal, dayMeals] = await Promise.all([
      loadDiary(db, targetId, date.data),
      currentGoal(db, targetId),
      mealsForDay(db, targetId, date.data),
    ])
    return c.json({ logs, goal, meals: dayMeals })
  })

export const campaignRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .onError((e, c) => {
    if (e instanceof AiError) return c.json({ error: e.code, message: e.message }, e.status)
    if (e instanceof HttpError) return c.json({ error: e.code }, e.status)
    throw e
  })
  .get('/', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const mine = await db
      .select({ id: campaigns.id, name: campaigns.name, inviteCode: campaigns.inviteCode, startsOn: campaigns.startsOn, endsOn: campaigns.endsOn })
      .from(campaigns)
      .innerJoin(campaignMembers, eq(campaignMembers.campaignId, campaigns.id))
      .where(eq(campaignMembers.userId, c.get('userId')))
      .orderBy(asc(campaigns.startsOn))
    const members = await membersOf(db, mine.map((m) => m.id))
    return c.json({ campaigns: mine.map((m) => ({ ...m, members: members.filter((x) => x.campaignId === m.id) })) })
  })
  .post(
    '/',
    zValidator('json', z.object({ name: z.string().trim().min(2).max(60), startsOn: isoDate, endsOn: isoDate.nullable().default(null) })),
    async (c) => {
      const body = c.req.valid('json')
      if (body.endsOn && body.endsOn < body.startsOn) return c.json({ error: 'invalid_dates' }, 400)
      const db = createDb(c.env.DATABASE_URL)
      const userId = c.get('userId')
      const [campaign] = await db.insert(campaigns).values({ ...body, inviteCode: newCode(), createdBy: userId }).returning()
      await db.insert(campaignMembers).values({ campaignId: campaign.id, userId })
      return c.json({ campaign }, 201)
    },
  )
  .post('/join', zValidator('json', z.object({ code: z.string().trim().toUpperCase().length(6) })), async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const [campaign] = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.inviteCode, c.req.valid('json').code))
    if (!campaign) return c.json({ error: 'invalid_code' }, 404)
    await db.insert(campaignMembers).values({ campaignId: campaign.id, userId: c.get('userId') }).onConflictDoNothing()
    return c.json({ campaignId: campaign.id })
  })
  .delete('/:id/me', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const campaignId = c.req.param('id')
    await db.delete(campaignMembers).where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, c.get('userId'))))
    const remaining = await membersOf(db, [campaignId])
    if (remaining.length === 0) await db.delete(campaigns).where(eq(campaigns.id, campaignId))
    return c.json({ ok: true })
  })
  .get('/:id/feed', async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const campaignId = c.req.param('id')
    if (!(await isMember(db, campaignId, c.get('userId')))) return c.json({ error: 'not_found' }, 404)
    const members = await membersOf(db, [campaignId])
    const ids = members.map((m) => m.userId)
    const [sessionsByMember, records] = await Promise.all([
      Promise.all(ids.map(async (id) => (await listSessions(db, id, { limit: 10 })).map((s) => ({ ...s, userId: id })))),
      recentRecords(db, ids, 15),
    ])
    const sessions = sessionsByMember.flat().sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt)).slice(0, 20)
    return c.json({ members, sessions, records })
  })
  // Applies a shared couple diet draft (kind diet_draft_duo) to each member's own plan: one menu, but each
  // member keeps their own copy with their own portions and only the foods they eat.
  .post('/:id/diet/apply', zValidator('json', z.object({ insightId: z.uuid() })), async (c) => {
    const db = createDb(c.env.DATABASE_URL)
    const campaignId = c.req.param('id')
    const userId = c.get('userId')
    if (!(await isMember(db, campaignId, userId))) return c.json({ error: 'not_found' }, 404)
    const [insight] = await db
      .select()
      .from(aiInsights)
      .where(and(eq(aiInsights.id, c.req.valid('json').insightId), eq(aiInsights.userId, userId)))
    if (!insight || insight.kind !== 'diet_draft_duo') return c.json({ error: 'not_found' }, 404)
    if (insight.status !== 'ready') return c.json({ error: 'already_handled' }, 409)
    const result = await applyDuoDietDraft(db, insight)
    return c.json({ ok: true, ...result })
  })
  .route('/:id/members/:userId', member)
