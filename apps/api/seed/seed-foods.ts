import { neon } from '@neondatabase/serverless'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-http'
import { readFileSync } from 'node:fs'
import { foods } from '../src/db/schema'
import { searchable } from '../src/lib/search'
import { extraFoods } from './extra-foods'

process.loadEnvFile('.dev.vars')

// TACO 4ª edição (NEPA/UNICAMP, 2011), via github.com/raulfdm/taco-api (MIT).
type TacoRow = { tacoId: number; name: string; category: string; kcal: number; protein: number; carbs: number; fat: number; fiber: number }
const taco: TacoRow[] = JSON.parse(readFileSync(new URL('./taco.json', import.meta.url), 'utf-8'))

const rows = [
  ...taco.map(({ tacoId, ...f }) => ({ ...f, source: 'taco' as const, sourceKey: `taco:${tacoId}` })),
  ...extraFoods.map(({ key, ...f }) => ({ ...f, source: 'reference' as const, sourceKey: `ref:${key}` })),
].map((f) => ({ ...f, searchName: searchable(f.name) }))

const db = drizzle(neon(process.env.DATABASE_URL!), { casing: 'snake_case' })

for (let i = 0; i < rows.length; i += 200) {
  await db
    .insert(foods)
    .values(rows.slice(i, i + 200))
    .onConflictDoUpdate({
      target: foods.sourceKey,
      set: Object.fromEntries(
        ['name', 'search_name', 'category', 'kcal', 'protein', 'carbs', 'fat', 'fiber'].map((col) => [
          col.replace(/_(\w)/g, (_, c) => c.toUpperCase()),
          sql.raw(`excluded.${col}`),
        ]),
      ),
    })
}

console.log(`seeded ${rows.length} foods`)
