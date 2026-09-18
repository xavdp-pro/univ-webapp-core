import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { buildTestApp, cookieOf, requestLink } from './helpers/testApp.js'
import { createFakeMailer } from './helpers/fakeMailer.js'

const ALLOWED = { email: 'member@example.test', displayName: 'Member', role: 'admin' }

async function seeded(opts = {}) {
  const ctx = buildTestApp(opts)
  await ctx.store.upsertUser(ALLOWED)
  return ctx
}

describe('magic-link flow', () => {
  it('request -> token -> exchange -> cookie -> protected route -> logout', async () => {
    const { app, mailer, cfg } = await seeded()

    const req = await requestLink(app, request, ALLOWED.email)
    expect(req.status).toBe(200)
    expect(req.body).toEqual({ ok: true, message: 'auth.linkSentIfAllowed' })
    expect(mailer.sent).toHaveLength(1)
    expect(mailer.sent[0].toEmail).toBe(ALLOWED.email)
    expect(mailer.sent[0].text).toContain('http://app.test/login#')
    const token = mailer.lastToken()
    expect(token).toMatch(/^[a-f0-9]{64}$/)

    // Protected route before exchange: 401.
    expect((await request(app).get('/api/ping')).status).toBe(401)

    const verify = await request(app).post('/api/auth/magic/verify').send({ token })
    expect(verify.status).toBe(200)
    expect(verify.body.user).toEqual({ email: ALLOWED.email, name: 'Member', role: 'admin' })
    const setCookie = verify.headers['set-cookie'][0]
    expect(setCookie).toContain(`${cfg.cookieName}=`)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    const cookie = cookieOf(verify)

    const me = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(me.status).toBe(200)
    expect(me.body.user.email).toBe(ALLOWED.email)

    const ping = await request(app).get('/api/ping').set('Cookie', cookie)
    expect(ping.status).toBe(200)
    expect(ping.body.user).toBe(ALLOWED.email)

    const logout = await request(app).post('/api/auth/logout').set('Cookie', cookie)
    expect(logout.status).toBe(200)
    expect(logout.headers['set-cookie'][0]).toMatch(/Expires=Thu, 01 Jan 1970/)
  })

  it('refuses a reused token', async () => {
    const { app, mailer } = await seeded()
    await requestLink(app, request, ALLOWED.email)
    const token = mailer.lastToken()
    expect((await request(app).post('/api/auth/magic/verify').send({ token })).status).toBe(200)
    const again = await request(app).post('/api/auth/magic/verify').send({ token })
    expect(again.status).toBe(410)
    expect(again.body.error).toBe('auth.linkUsed')
  })

  it('refuses an expired token', async () => {
    const clock = { now: new Date('2026-09-18T06:00:00Z') }
    const { app, mailer, store } = await seeded({ clock })
    await requestLink(app, request, ALLOWED.email)
    const token = mailer.lastToken()
    store.clock.now = new Date('2026-09-18T06:16:00Z') // TTL is 15 minutes
    const res = await request(app).post('/api/auth/magic/verify').send({ token })
    expect(res.status).toBe(410)
    expect(res.body.error).toBe('auth.linkExpired')
  })

  it('refuses unknown and malformed tokens', async () => {
    const { app } = await seeded()
    expect((await request(app).post('/api/auth/magic/verify').send({ token: 'nope' })).status).toBe(400)
    expect((await request(app).post('/api/auth/magic/verify').send({ token: 'a'.repeat(64) })).status).toBe(400)
  })

  it('answers the same for an address that is not allowed, and sends nothing', async () => {
    const { app, mailer } = await seeded()
    const res = await requestLink(app, request, 'stranger@example.test')
    expect(res.status).toBe(200)
    expect(res.body.message).toBe('auth.linkSentIfAllowed')
    expect(mailer.sent).toHaveLength(0)
  })

  it('rejects a missing address', async () => {
    const { app } = await seeded()
    const res = await request(app).post('/api/auth/magic/request').send({ email: 'not-an-address' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('auth.emailRequired')
  })

  it('trips the per-address limit', async () => {
    const { app } = await seeded({ env: { MAGIC_MAX_PER_EMAIL: '3', MAGIC_MAX_PER_IP: '100' } })
    for (let i = 0; i < 3; i += 1) {
      expect((await request(app).post('/api/auth/magic/request').send({ email: ALLOWED.email })).status).toBe(200)
    }
    const blocked = await request(app).post('/api/auth/magic/request').send({ email: ALLOWED.email })
    expect(blocked.status).toBe(429)
    expect(blocked.body.error).toBe('auth.tooManyRequests')
  })

  it('trips the per-ip limit across addresses, including unknown ones', async () => {
    const { app } = await seeded({ env: { MAGIC_MAX_PER_EMAIL: '100', MAGIC_MAX_PER_IP: '2' } })
    expect((await request(app).post('/api/auth/magic/request').send({ email: 'a@example.test' })).status).toBe(200)
    expect((await request(app).post('/api/auth/magic/request').send({ email: 'b@example.test' })).status).toBe(200)
    expect((await request(app).post('/api/auth/magic/request').send({ email: ALLOWED.email })).status).toBe(429)
  })

  it('trips the generic express-rate-limit on /api/auth', async () => {
    const { app } = await seeded({ env: { RATE_LIMIT_AUTH_PER_15MIN: '2' } })
    await request(app).post('/api/auth/logout')
    await request(app).post('/api/auth/logout')
    const res = await request(app).post('/api/auth/logout')
    expect(res.status).toBe(429)
    expect(res.body.error).toBe('auth.tooManyRequests')
  })

  it('never reveals a mailer failure: same answer, failure logged, still counted', async () => {
    const { app, store } = await seeded({ env: { MAGIC_MAX_PER_EMAIL: '1' }, mailer: createFakeMailer({ fail: true }) })
    const res = await requestLink(app, request, ALLOWED.email)
    expect(res.status).toBe(200)
    expect(res.body.message).toBe('auth.linkSentIfAllowed')
    expect(store.log.at(-1).outcome).toBe('send_failed')
    expect((await requestLink(app, request, ALLOWED.email)).status).toBe(429)
  })

  it('answers before the lookup and the mail: allowed and unknown addresses look the same', async () => {
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const mailer = createFakeMailer()
    const slowMailer = { ...mailer, async send(m) { await gate; return mailer.send(m) } }
    const { app } = await seeded({ mailer: slowMailer })
    const known = await request(app).post('/api/auth/magic/request').send({ email: ALLOWED.email })
    const unknown = await request(app).post('/api/auth/magic/request').send({ email: 'stranger@example.test' })
    // The mail is still blocked, yet both answers are already out, and identical.
    expect(mailer.sent).toHaveLength(0)
    expect([known.status, known.body]).toEqual([unknown.status, unknown.body])
    release()
    await app.locals.settleAuth()
    expect(mailer.sent).toHaveLength(1)
  })

  it('keys the per-IP limit on req.ip: a client cannot rotate X-Forwarded-For or cf-connecting-ip', async () => {
    // TRUST_PROXY=0 models an API reached directly, where every forwarding header is the client's.
    const { app } = await seeded({ env: { TRUST_PROXY: '0', MAGIC_MAX_PER_IP: '2', MAGIC_MAX_PER_EMAIL: '100' } })
    const codes = []
    for (let i = 0; i < 4; i += 1) {
      const res = await requestLink(app, request, `user${i}@example.test`, { 'X-Forwarded-For': `10.0.0.${i}`, 'cf-connecting-ip': `10.1.0.${i}` })
      codes.push(res.status)
    }
    expect(codes).toEqual([200, 200, 429, 429])
  })

  it('honours cf-connecting-ip only when TRUST_CLOUDFLARE_IP=true', async () => {
    const { app, store } = await seeded({ env: { TRUST_PROXY: '0', TRUST_CLOUDFLARE_IP: 'true' } })
    await requestLink(app, request, ALLOWED.email, { 'cf-connecting-ip': '203.0.113.7' })
    expect(store.log.find((r) => r.outcome === 'requested').ip).toBe('203.0.113.7')
  })

  it('ends a session whose address left the allowlist', async () => {
    const { app, mailer, store } = await seeded()
    await requestLink(app, request, ALLOWED.email)
    const verify = await request(app).post('/api/auth/magic/verify').send({ token: mailer.lastToken() })
    const cookie = cookieOf(verify)
    store.users.delete(ALLOWED.email)
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie)
    expect(me.status).toBe(401)
    expect(me.body.error).toBe('auth.accessRevoked')
  })

  it('rejects a cookie signed with another secret', async () => {
    const { app } = await seeded()
    const other = buildTestApp({ env: { JWT_SECRET: 'another-secret-that-is-long-enough' } })
    await other.store.upsertUser(ALLOWED)
    await requestLink(other.app, request, ALLOWED.email)
    const verify = await request(other.app).post('/api/auth/magic/verify').send({ token: other.mailer.lastToken() })
    const res = await request(app).get('/api/ping').set('Cookie', cookieOf(verify))
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('auth.sessionExpired')
  })
})
