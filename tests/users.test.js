import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { buildTestApp, cookieOf, createStubDb, signIn } from './helpers/testApp.js'
import { createMemoryAuthStore } from './helpers/memoryAuthStore.js'
import { seedAllowedUsers } from '../server/lib/seedUsers.js'
import { validateUserInput } from '../server/routes/users.js'

const ADMIN = { email: 'admin@example.test', displayName: 'Admin', role: 'admin' }
const OTHER_ADMIN = { email: 'second@example.test', displayName: 'Second', role: 'admin' }
const MEMBER = { email: 'member@example.test', displayName: 'Member', role: 'member' }

const SAMPLE = [
  { email: 'admin@example.test', displayName: 'Admin', role: 'admin', active: 1, createdAt: '2026-09-18T05:00:00.000Z', updatedAt: '2026-09-18T05:00:00.000Z' },
  { email: 'member@example.test', displayName: 'Member', role: 'member', active: 0, createdAt: '2026-09-18T06:00:00.000Z', updatedAt: '2026-09-18T06:00:00.000Z' },
]

function stub() {
  return createStubDb({ answer: (sql) => (/COUNT/.test(sql) ? [{ total: 2 }] : SAMPLE) })
}

async function asAdmin(opts = {}) {
  const ctx = buildTestApp(opts)
  const cookie = await signIn(ctx, request, ADMIN)
  return { ...ctx, cookie }
}

describe('users: access', () => {
  it('requires a session', async () => {
    const { app } = buildTestApp()
    expect((await request(app).get('/api/users')).status).toBe(401)
    expect((await request(app).post('/api/users').send({})).status).toBe(401)
    expect((await request(app).patch('/api/users/x@example.test').send({})).status).toBe(401)
    expect((await request(app).delete('/api/users/x@example.test')).status).toBe(401)
  })

  it('refuses a member on every verb', async () => {
    const ctx = buildTestApp()
    const cookie = await signIn(ctx, request, MEMBER)
    for (const call of [
      request(ctx.app).get('/api/users'),
      request(ctx.app).post('/api/users').send(MEMBER),
      request(ctx.app).patch('/api/users/admin@example.test').send({ role: 'member' }),
      request(ctx.app).delete('/api/users/admin@example.test'),
    ]) {
      const res = await call.set('Cookie', cookie)
      expect(res.status).toBe(403)
      expect(res.body.error).toBe('auth.forbidden')
    }
  })
})

describe('GET /api/users', () => {
  it('lists through listQuery with the public shape', async () => {
    const { app, cookie, db } = await asAdmin({ db: stub() })
    const res = await request(app).get('/api/users').query({ q: 'adm', f_role: 'admin', f_active: '1', sort: 'createdAt', dir: 'desc' }).set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ total: 2, page: 1, pageSize: 20, sort: 'createdAt', dir: 'desc', q: 'adm' })
    expect(res.body.rows[0]).toEqual({ ...SAMPLE[0], active: true })
    expect(res.body.rows[1].active).toBe(false)
    const listCall = db.calls.find((c) => /LIMIT/.test(c.sql))
    expect(listCall.sql).toBe("SELECT email, display_name AS displayName, role, active, created_at AS createdAt, updated_at AS updatedAt FROM auth_users WHERE role = ? AND active = ? AND (email LIKE ? ESCAPE '!' OR display_name LIKE ? ESCAPE '!') ORDER BY created_at DESC LIMIT ? OFFSET ?")
    expect(listCall.params).toEqual(['admin', '1', '%adm%', '%adm%', 20, 0])
  })

  it('reports a database failure as 500', async () => {
    const db = createStubDb({ answer: () => { throw new Error('boom') } })
    const { app, cookie } = await asAdmin({ db })
    const res = await request(app).get('/api/users').set('Cookie', cookie)
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'common.serverError' })
  })
})

describe('POST /api/users', () => {
  it('refuses an invalid body with one key per field', async () => {
    const { app, cookie } = await asAdmin()
    const res = await request(app).post('/api/users').send({ email: 'nope', displayName: '', role: 'root' }).set('Cookie', cookie)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'form.invalid', fields: { email: 'form.email', displayName: 'form.required', role: 'form.invalidChoice' } })
  })

  it('caps lengths and requires the address', async () => {
    const { app, cookie } = await asAdmin()
    const long = await request(app).post('/api/users').send({ email: `${'a'.repeat(200)}@example.test`, displayName: 'x'.repeat(121), role: 'member' }).set('Cookie', cookie)
    expect(long.body.fields).toEqual({ email: 'form.maxLength', displayName: 'form.maxLength' })
    const missing = await request(app).post('/api/users').send({ displayName: 'X', role: 'member' }).set('Cookie', cookie)
    expect(missing.body.fields).toEqual({ email: 'form.required' })
  })

  it('creates a user, lowercased and trimmed', async () => {
    const { app, cookie, store } = await asAdmin()
    const res = await request(app).post('/api/users').send({ email: '  New.Person@Example.TEST ', displayName: ' New ', role: 'member' }).set('Cookie', cookie)
    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(true)
    expect(res.body.user).toMatchObject({ email: 'new.person@example.test', displayName: 'New', role: 'member', active: true })
    expect(await store.findUser('new.person@example.test')).toMatchObject({ role: 'member' })
  })

  it('refuses a duplicate address, even a removed one, under the email field', async () => {
    const { app, cookie, store } = await asAdmin()
    await store.upsertUser(MEMBER)
    const dup = await request(app).post('/api/users').send({ email: 'MEMBER@example.test', displayName: 'Again', role: 'member' }).set('Cookie', cookie)
    expect(dup.status).toBe(409)
    expect(dup.body).toEqual({ error: 'users.emailTaken', fields: { email: 'users.emailTaken' } })
    await store.updateUser(MEMBER.email, { active: false })
    const removed = await request(app).post('/api/users').send({ email: MEMBER.email, displayName: 'Again', role: 'member' }).set('Cookie', cookie)
    expect(removed.status).toBe(409)
  })
})

describe('PATCH and DELETE /api/users/:email', () => {
  it('edits name and role, and validates a patch field by field', async () => {
    const { app, cookie, store } = await asAdmin()
    await store.upsertUser(MEMBER)
    const res = await request(app).patch(`/api/users/${MEMBER.email}`).send({ displayName: 'Renamed', role: 'admin' }).set('Cookie', cookie)
    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ email: MEMBER.email, displayName: 'Renamed', role: 'admin', active: true })
    const bad = await request(app).patch(`/api/users/${MEMBER.email}`).send({ role: 'root', active: 'yes' }).set('Cookie', cookie)
    expect(bad.status).toBe(400)
    expect(bad.body.fields).toEqual({ role: 'form.invalidChoice', active: 'form.invalidChoice' })
    expect((await request(app).patch('/api/users/ghost@example.test').send({ role: 'member' }).set('Cookie', cookie)).status).toBe(404)
  })

  it('deactivates a user, which ends that user\'s session, and restores it', async () => {
    const { app, cookie, store, mailer } = await asAdmin()
    // A member signs in first.
    const memberCookie = await signIn({ app, store, mailer }, request, MEMBER)
    expect((await request(app).get('/api/auth/me').set('Cookie', memberCookie)).status).toBe(200)

    const removed = await request(app).delete(`/api/users/${MEMBER.email}`).set('Cookie', cookie)
    expect(removed.status).toBe(200)
    expect(removed.body.user.active).toBe(false)
    const me = await request(app).get('/api/auth/me').set('Cookie', memberCookie)
    expect(me.status).toBe(401)
    expect(me.body.error).toBe('auth.accessRevoked')
    // No magic link for a removed address either.
    const before = mailer.sent.length
    await request(app).post('/api/auth/magic/request').send({ email: MEMBER.email })
    expect(mailer.sent.length).toBe(before)

    const restored = await request(app).patch(`/api/users/${MEMBER.email}`).send({ active: true }).set('Cookie', cookie)
    expect(restored.body.user.active).toBe(true)
    expect(await store.findUser(MEMBER.email)).not.toBeNull()
  })

  it('refuses self-removal and self-demotion', async () => {
    const { app, cookie, store } = await asAdmin()
    await store.upsertUser(OTHER_ADMIN)
    const del = await request(app).delete(`/api/users/${ADMIN.email}`).set('Cookie', cookie)
    expect(del.status).toBe(409)
    expect(del.body.error).toBe('users.cannotRemoveSelf')
    const off = await request(app).patch(`/api/users/${ADMIN.email}`).send({ active: false }).set('Cookie', cookie)
    expect(off.body.error).toBe('users.cannotRemoveSelf')
    const demote = await request(app).patch(`/api/users/${ADMIN.email}`).send({ role: 'member' }).set('Cookie', cookie)
    expect(demote.status).toBe(409)
    expect(demote.body.error).toBe('users.cannotDemoteSelf')
    // Renaming oneself is fine.
    const rename = await request(app).patch(`/api/users/${ADMIN.email}`).send({ displayName: 'Me' }).set('Cookie', cookie)
    expect(rename.status).toBe(200)
  })

  it('refuses to remove or demote the last active admin', async () => {
    // The requester's session says admin but the row was demoted meanwhile: the guard still holds.
    const { app, cookie, store } = await asAdmin()
    await store.upsertUser(OTHER_ADMIN)
    await store.updateUser(ADMIN.email, { role: 'member' })
    const del = await request(app).delete(`/api/users/${OTHER_ADMIN.email}`).set('Cookie', cookie)
    expect(del.status).toBe(409)
    expect(del.body.error).toBe('users.lastAdmin')
    const demote = await request(app).patch(`/api/users/${OTHER_ADMIN.email}`).send({ role: 'member' }).set('Cookie', cookie)
    expect(demote.body.error).toBe('users.lastAdmin')
    // With two active admins, one may go.
    await store.updateUser(ADMIN.email, { role: 'admin' })
    expect((await request(app).delete(`/api/users/${OTHER_ADMIN.email}`).set('Cookie', cookie)).status).toBe(200)
  })
})

describe('AUTH_USERS seed rule', () => {
  it('inserts missing users, never updates, never revives', async () => {
    const store = createMemoryAuthStore()
    const raw = 'admin@example.test|Admin|admin, member@example.test|Member|member'
    expect(await seedAllowedUsers(store, raw)).toEqual({ inserted: ['admin@example.test', 'member@example.test'], kept: [] })

    // An admin edits the role from the page, and removes the member.
    await store.updateUser('admin@example.test', { role: 'member', displayName: 'Renamed' })
    await store.updateUser('member@example.test', { active: false })

    // Next boot with the same .env: nothing changes.
    expect(await seedAllowedUsers(store, raw)).toEqual({ inserted: [], kept: ['admin@example.test', 'member@example.test'] })
    expect(await store.findUserAny('admin@example.test')).toMatchObject({ role: 'member', displayName: 'Renamed' })
    expect(await store.findUser('member@example.test')).toBeNull()

    // A new address in .env is inserted.
    const again = await seedAllowedUsers(store, `${raw}, new@example.test|New|admin`)
    expect(again.inserted).toEqual(['new@example.test'])
    expect(await seedAllowedUsers(store, '')).toEqual({ inserted: [], kept: [] })
  })
})

describe('validateUserInput', () => {
  it('ignores the email on a partial validation and accepts booleans for active', () => {
    expect(validateUserInput({ email: 'nope', active: false }, { partial: true })).toEqual({ values: { active: false }, fields: {} })
    expect(validateUserInput({}, { partial: true })).toEqual({ values: {}, fields: {} })
    expect(validateUserInput({ email: 'A@B.CO', displayName: 'N', role: 'admin' })).toEqual({ values: { email: 'a@b.co', displayName: 'N', role: 'admin' }, fields: {} })
  })
})
