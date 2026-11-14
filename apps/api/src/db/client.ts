import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

export const createDb = (url: string) => drizzle(neon(url), { schema, casing: 'snake_case' })
