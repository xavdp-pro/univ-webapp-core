/**
 * Plain SQL migration runner: `npm run migrate`.
 * Applies every server/migrations/NNN_*.sql not yet recorded in schema_migrations,
 * in file order, each file in one multi-statement batch. Add a new numbered file;
 * never edit an applied one.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import { config } from '../config.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))

function password() {
  if (config.db.password) return config.db.password
  if (config.db.passwordFile) return readFileSync(config.db.passwordFile, 'utf8').trim()
  return ''
}

async function main() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: password(),
    database: config.db.database,
    multipleStatements: true,
  })
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(190) NOT NULL PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    const [rows] = await conn.query('SELECT name FROM schema_migrations')
    const applied = new Set(rows.map((r) => r.name))
    const files = readdirSync(HERE).filter((f) => /^\d{3,}_.*\.sql$/.test(f)).sort()
    let count = 0
    for (const file of files) {
      if (applied.has(file)) continue
      const sql = readFileSync(path.join(HERE, file), 'utf8')
      await conn.query(sql)
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file])
      console.log(`[${config.appName}] applied ${file}`)
      count += 1
    }
    console.log(`[${config.appName}] migrations: ${count} applied, ${files.length - count} already in place`)
  } finally {
    await conn.end()
  }
}

main().catch((err) => {
  console.error(`[${config.appName}] migrate failed:`, err.message)
  process.exit(1)
})
