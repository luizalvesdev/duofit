import { sign } from 'hono/jwt'

const THIRTY_DAYS = 60 * 60 * 24 * 30

export const issueToken = (userId: string, secret: string) =>
  sign({ sub: userId, exp: Math.floor(Date.now() / 1000) + THIRTY_DAYS }, secret, 'HS256')
