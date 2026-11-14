import { neon } from '@neondatabase/serverless'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-http'
import { exercises } from '../src/db/schema'
import { catalog } from './catalog'

process.loadEnvFile('.dev.vars')

const db = drizzle(neon(process.env.DATABASE_URL!), { casing: 'snake_case' })

const rows = catalog.map(({ slug, name, muscle, equipment, secondary = [], image = true }) => ({
  slug,
  name,
  primaryMuscle: muscle,
  secondaryMuscles: secondary,
  equipment,
  imagePath: image ? `${slug}/0.jpg` : null,
}))

await db
  .insert(exercises)
  .values(rows)
  .onConflictDoUpdate({
    target: exercises.slug,
    set: {
      name: sql`excluded.name`,
      primaryMuscle: sql`excluded.primary_muscle`,
      secondaryMuscles: sql`excluded.secondary_muscles`,
      equipment: sql`excluded.equipment`,
      imagePath: sql`excluded.image_path`,
    },
  })

console.log(`seeded ${rows.length} exercises`)
