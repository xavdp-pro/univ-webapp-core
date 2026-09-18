import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { buildTestApp, createStubDb, signIn } from './helpers/testApp.js'

const ADMIN = { email: 'admin@example.test', displayName: 'Admin', role: 'admin' }
const MEMBER = { email: 'member@example.test', displayName: 'Member', role: 'member' }

const SAMPLE = [
  { id: 2, email: 'b@example.test', outcome: 'link_sent', detail: null, ip: '10.0.0.2', createdAt: '2026-09-18T06:00:00.000Z' },
  { id: 1, email: 'a@example.test', outcome: 'not_authorized', detail: null, ip: '10.0.0.1', createdAt: '2026-09-18T05:00:00.000Z' },
]

function stub() {
  return createStubDb({ answer: (sql) => (/COUNT/.test(sql) ? [{ total: 2 }] : SAMPLE) })
}

describe('GET /api/auth-requests', () => {
  it('requires a session', async () => {
    const { app } = buildTestApp()
    expect((await request(app).get('/api/auth-requests')).status).toBe(401)
  })

  it('refuses a member', async () => {
    const ctx = buildTestApp()
    const cookie = await signIn(ctx, request, MEMBER)
    const res = await request(ctx.app).get('/api/auth-requests').set('Cookie', cookie)
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('auth.forbidden')
  })

  it('answers { rows, total } for an admin with the default sort', async () => {
    const ctx = buildTestApp({ db: stub() })
    const cookie = await signIn(ctx, request, ADMIN)
    const res = await request(ctx.app).get('/api/auth-requests').set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ rows: SAMPLE, total: 2, page: 1, pageSize: 20, sort: 'createdAt', dir: 'desc', q: '' })
    const listCall = ctx.db.calls.find((c) => /LIMIT/.test(c.sql))
    expect(listCall.sql).toBe('SELECT id, email, outcome, detail, ip, created_at AS createdAt FROM auth_request_log  ORDER BY created_at DESC LIMIT ? OFFSET ?')
    expect(listCall.params).toEqual([20, 0])
  })

  it('binds search, filter and paging; sort injection falls back to the default', async () => {
    const ctx = buildTestApp({ db: stub() })
    const cookie = await signIn(ctx, request, ADMIN)
    const res = await request(ctx.app)
      .get('/api/auth-requests')
      .query({ page: 2, pageSize: 500, q: '%', f_outcome: 'link_sent', sort: 'email; DROP TABLE auth_users', dir: 'asc' })
      .set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ page: 2, pageSize: 100, sort: 'createdAt', dir: 'asc' })
    const listCall = ctx.db.calls.find((c) => /LIMIT/.test(c.sql))
    expect(listCall.sql).not.toMatch(/DROP/)
    expect(listCall.sql).toContain("WHERE outcome = ? AND (email LIKE ? ESCAPE '!' OR ip LIKE ? ESCAPE '!' OR detail LIKE ? ESCAPE '!') ORDER BY created_at ASC LIMIT ? OFFSET ?")
    expect(listCall.params).toEqual(['link_sent', '%!%%', '%!%%', '%!%%', 100, 100])
  })

  it('reports a database failure as 500 without leaking the message', async () => {
    const db = createStubDb({ answer: () => { throw new Error('connect ECONNREFUSED') } })
    const ctx = buildTestApp({ db })
    const cookie = await signIn(ctx, request, ADMIN)
    const res = await request(ctx.app).get('/api/auth-requests').set('Cookie', cookie)
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'common.serverError' })
  })
})
