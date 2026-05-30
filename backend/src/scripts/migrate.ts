import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { dbPool } from '../db/pool'

const run = async () => {
  const migrationDirectory = resolve(process.cwd(), 'backend/db/migrations')
  const entries = await readdir(migrationDirectory)
  const migrationFiles = entries.filter((entry) => entry.endsWith('.sql')).sort()

  for (const fileName of migrationFiles) {
    const sqlPath = resolve(migrationDirectory, fileName)
    const sql = await readFile(sqlPath, 'utf-8')
    await dbPool.query(sql)
    console.log('Migration executed:', sqlPath)
  }

  await dbPool.end()
}

run().catch(async (error) => {
  console.error(error)
  await dbPool.end()
  process.exit(1)
})
