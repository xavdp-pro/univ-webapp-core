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

/** Wires the real app with an in-memory store, a fake mailer and a stubbed db. */
export function buildTestApp({ env = {}, dbUp = true, mailer, clock } = {}) {
  const cfg = createConfig({ ...BASE_ENV, ...env })
  const store = createMemoryAuthStore({ clock })
  const fakeMailer = mailer || createFakeMailer()
  const db = { ping: async () => dbUp }
  const app = createApp({ cfg, db, store, mailer: fakeMailer })
  return { app, cfg, store, mailer: fakeMailer }
}

/** Pulls the session cookie pair out of a supertest response. */
export function cookieOf(res) {
  return (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ')
}
