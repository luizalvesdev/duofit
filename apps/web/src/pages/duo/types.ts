import type { Goal } from '../../lib/types'
import type { BodyLog } from '../progress/BodyTab'
import type { SessionSummary } from '../progress/HistoryTab'
import type { ExerciseBest, RecentRecord } from '../progress/RecordsTab'

export type Member = { campaignId: string; userId: string; name: string; shareDiet: boolean }

export type Campaign = {
  id: string
  name: string
  inviteCode: string
  startsOn: string
  endsOn: string | null
  members: Member[]
}

export type Feed = { members: Member[]; sessions: (SessionSummary & { userId: string })[]; records: RecentRecord[] }

export type MemberOverview = {
  user: { id: string; name: string }
  goal: Goal | null
  body: BodyLog[]
  sessions: SessionSummary[]
  bests: ExerciseBest[]
  sharesDiet: boolean
}
