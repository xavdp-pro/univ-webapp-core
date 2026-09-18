import http from 'node:http'
import { config, assertProductionSecrets } from './config.js'
import { createDb } from './lib/db.js'
import { createAuthStore } from './lib/authStore.js'
import { createMailer } from './lib/mailer.js'
import { parseAuthUsers } from './lib/tokens.js'
import { initRealtime } from './lib/realtime.js'
import { createApp } from './app.js'

const tag = `[${config.appName}]`

async function seedUsers(store) {
  const users = parseAuthUsers(config.auth.seedUsers)
  for (const u of users) await store.upsertUser(u)
  if (users.length) console.log(`${tag} ${users.length} allowed user(s) seeded from AUTH_USERS`)
}

async function main() {
  assertProductionSecrets(config)
  const db = createDb(config)
  const store = createAuthStore(db)
  const mailer = createMailer(config)
  if (mailer.kind === 'console') {
    console.warn(`${tag} No Mailjet keys: magic links are printed on this console (development mode)`)
  }

  if (await db.ping()) {
    await seedUsers(store)
  } else {
    console.warn(`${tag} Database unreachable at boot; /api/health will report db=down until it answers`)
  }

  const app = createApp({ cfg: config, db, store, mailer })
  const server = http.createServer(app)
  if (config.realtimeEnabled) initRealtime(server, config)

  server.listen(config.port, config.host, () => {
    console.log(`${tag} API listening on http://${config.host}:${config.port} (${config.nodeEnv}, realtime ${config.realtimeEnabled ? 'on' : 'off'}, dist ${config.serveDist ? 'served' : 'not served'})`)
  })

  const shutdown = () => {
    server.close(() => db.close().finally(() => process.exit(0)))
    setTimeout(() => process.exit(0), 3000).unref()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  console.error(`${tag} fatal:`, err.message)
  process.exit(1)
})
