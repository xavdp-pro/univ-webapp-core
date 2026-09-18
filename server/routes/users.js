/**
 * Allowed users, managed by admins. The table is the allowlist itself
 * (auth_users): a user is "removed" by deactivation, so a session of that
 * address ends at the next /me and AUTH_USERS cannot bring it back at boot
 * (see lib/seedUsers.js). Reactivation is a PATCH { active: true }.
 *
 *   GET    /api/users?page=&pageSize=&sort=&dir=&q=&f_role=&f_active=   -> { rows, total, ... }
 *   POST   /api/users   { email, displayName, role }                     -> 201 { ok, user }
 *   PATCH  /api/users/:email { displayName?, role?, active? }            -> { ok, user }
 *   DELETE /api/users/:email                                             -> { ok, user }  (deactivates)
 *
 * A refused form answers 400 { error: 'form.invalid', fields: { email: 'form.email' } }
 * so the client shows each message under its field; a duplicate address is
 * 409 with `fields.email = 'users.emailTaken'`. Guards (409): an admin cannot
 * deactivate or demote themselves, and the last active admin cannot be
 * deactivated or demoted by anyone.
 */
import { Router } from 'express'
import { runListQuery } from '../lib/listQuery.js'

export const ROLES = ['admin', 'member']
export const EMAIL_MAX = 190
export const DISPLAY_NAME_MAX = 120
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const USERS_SPEC = {
  columns: {
    email: 'email',
    displayName: 'display_name',
    role: 'role',
    active: 'active',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  sortable: ['email', 'displayName', 'role', 'active', 'createdAt', 'updatedAt'],
  searchable: ['email', 'displayName'],
  filters: ['role', 'active'],
  defaultSort: 'email',
  defaultDir: 'asc',
  defaultPageSize: 20,
  maxPageSize: 100,
}

const SELECT = 'email, display_name AS displayName, role, active, created_at AS createdAt, updated_at AS updatedAt'

function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Validates a create body (`partial: false`, every field required) or a patch
 * (`partial: true`, present fields only). Returns `{ values, fields }` where
 * `fields` maps a field name to an i18n key; empty when valid.
 */
export function validateUserInput(body = {}, { partial = false } = {}) {
  const values = {}
  const fields = {}
  const has = (name) => body && body[name] !== undefined

  if (!partial) {
    const email = str(body?.email).toLowerCase()
    if (!email) fields.email = 'form.required'
    else if (email.length > EMAIL_MAX) fields.email = 'form.maxLength'
    else if (!EMAIL_RE.test(email)) fields.email = 'form.email'
    else values.email = email
  }

  if (!partial || has('displayName')) {
    const displayName = str(body?.displayName)
    if (!displayName) fields.displayName = 'form.required'
    else if (displayName.length > DISPLAY_NAME_MAX) fields.displayName = 'form.maxLength'
    else values.displayName = displayName
  }

  if (!partial || has('role')) {
    const role = str(body?.role)
    if (!ROLES.includes(role)) fields.role = 'form.invalidChoice'
    else values.role = role
  }

  if (partial && has('active')) {
    if (typeof body.active !== 'boolean') fields.active = 'form.invalidChoice'
    else values.active = body.active
  }

  return { values, fields }
}

function publicUser(user) {
  if (!user) return null
  const { email, displayName, role, active, createdAt, updatedAt } = user
  return { email, displayName, role, active: Boolean(active), createdAt, updatedAt }
}

/**
 * @param {object} deps
 * @param {{ query: Function }} deps.db
 * @param {ReturnType<import('../lib/authStore.js').createAuthStore>} deps.store
 * @param {Function} deps.authMiddleware
 * @param {Function} deps.requireRole
 */
export function createUsersRouter({ db, store, authMiddleware, requireRole }) {
  const router = Router()
  router.use(authMiddleware, requireRole('admin'))

  router.get('/', async (req, res) => {
    try {
      const result = await runListQuery(db, { query: req.query, spec: USERS_SPEC, select: SELECT, from: 'auth_users' })
      res.json({ ...result, rows: result.rows.map(publicUser) })
    } catch (err) {
      console.error('[users] list failed', err.message)
      res.status(500).json({ error: 'common.serverError' })
    }
  })

  router.post('/', async (req, res) => {
    const { values, fields } = validateUserInput(req.body)
    if (Object.keys(fields).length) return res.status(400).json({ error: 'form.invalid', fields })
    try {
      if (await store.findUserAny(values.email)) {
        return res.status(409).json({ error: 'users.emailTaken', fields: { email: 'users.emailTaken' } })
      }
      const user = await store.createUser(values)
      return res.status(201).json({ ok: true, user: publicUser(user) })
    } catch (err) {
      console.error('[users] create failed', err.message)
      return res.status(500).json({ error: 'common.serverError' })
    }
  })

  /**
   * Shared by PATCH and DELETE: loads the target and applies the guards for a
   * change that would demote or deactivate. Answers on refusal and returns null.
   */
  async function guardedTarget(req, res, patch) {
    const email = String(req.params.email || '').trim().toLowerCase()
    const target = await store.findUserAny(email)
    if (!target) {
      res.status(404).json({ error: 'users.notFound' })
      return null
    }
    const self = req.user.email === target.email
    const deactivating = patch.active === false && target.active
    const demoting = patch.role !== undefined && patch.role !== 'admin' && target.role === 'admin'
    if (self && deactivating) {
      res.status(409).json({ error: 'users.cannotRemoveSelf' })
      return null
    }
    if (self && demoting) {
      res.status(409).json({ error: 'users.cannotDemoteSelf' })
      return null
    }
    if ((deactivating || demoting) && target.role === 'admin' && target.active && (await store.countActiveAdmins()) <= 1) {
      res.status(409).json({ error: 'users.lastAdmin' })
      return null
    }
    return target
  }

  router.patch('/:email', async (req, res) => {
    const { values, fields } = validateUserInput(req.body, { partial: true })
    if (Object.keys(fields).length) return res.status(400).json({ error: 'form.invalid', fields })
    try {
      const target = await guardedTarget(req, res, values)
      if (!target) return undefined
      const user = await store.updateUser(target.email, values)
      return res.json({ ok: true, user: publicUser(user) })
    } catch (err) {
      console.error('[users] update failed', err.message)
      return res.status(500).json({ error: 'common.serverError' })
    }
  })

  router.delete('/:email', async (req, res) => {
    try {
      const target = await guardedTarget(req, res, { active: false })
      if (!target) return undefined
      const user = await store.updateUser(target.email, { active: false })
      return res.json({ ok: true, user: publicUser(user) })
    } catch (err) {
      console.error('[users] remove failed', err.message)
      return res.status(500).json({ error: 'common.serverError' })
    }
  })

  return router
}
