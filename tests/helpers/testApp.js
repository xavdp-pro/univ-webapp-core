import { createConfig } from '../../server/config.js'
import { createApp } from '../../server/app.js'
import { createMemoryAuthStore } from './memoryAuthStore.js'
import { createFakeMailer } from './fakeMailer.js'

const BASE_ENV = {
  NODE_ENV: 'test',
  APP_NAME: 'testapp',
  JWT_SECRET: 'test-secret-long-enough-0123456789',
  PUBLIC_URL: 'http://app.test',
}

/**
 * Stub db: `ping` answers `dbUp`, `query` records every call in `calls` and
 * answers with `answer(sql, params)` (default: a zero count, then no rows).
 */
export function createStubDb({ dbUp = true, answer } = {}) {
  const calls = []
  return {
    calls,
    ping: async () => dbUp,
    async query(sql, params = []) {
      calls.push({ sql, params })
      if (answer) return answer(sql, params)
      return /^SELECT COUNT\(\*\)/i.test(sql) ? [{ total: 0 }] : []
    },
  }
}

/** Wires the real app with an in-memory store, a fake mailer and a stubbed db. */
export function buildTestApp({ env = {}, dbUp = true, mailer, clock, db } = {}) {
  const cfg = createConfig({ ...BASE_ENV, ...env })
  const store = createMemoryAuthStore({ clock })
  const fakeMailer = mailer || createFakeMailer()
  const stubDb = db || createStubDb({ dbUp })
  const app = createApp({ cfg, db: stubDb, store, mailer: fakeMailer })
  return { app, cfg, store, mailer: fakeMailer, db: stubDb }
}

/** Signs a user in through the real magic-link flow and returns the cookie header. */
export async function signIn(ctx, request, user) {
  await ctx.store.upsertUser(user)
  await request(ctx.app).post('/api/auth/magic/request').send({ email: user.email })
  await ctx.app.locals.settleAuth()
  const verify = await request(ctx.app).post('/api/auth/magic/verify').send({ token: ctx.mailer.lastToken() })
  return cookieOf(verify)
}

/** Posts a magic-link request and waits for the work that runs after the response. */
export async function requestLink(app, request, email, headers = {}) {
  const res = await request(app).post('/api/auth/magic/request').set(headers).send({ email })
  await app.locals.settleAuth()
  return res
}

/** Pulls the session cookie pair out of a supertest response. */
export function cookieOf(res) {
  return (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ')
}
