/**
 * Example list endpoint built with server/lib/listQuery.js, over a table the
 * mold already owns: the magic-link request log. Admin only.
 *
 * GET /api/auth-requests?page=1&pageSize=20&sort=createdAt&dir=desc&q=text&f_outcome=link_sent
 *   -> { rows: [{ id, email, outcome, detail, ip, createdAt }], total, page, pageSize, sort, dir, q }
 *
 * The spec below is the whole contract: keys the client may sort on, search
 * over and filter by, each mapped to a developer-written SQL expression.
 */
import { Router } from 'express'
import { runListQuery } from '../lib/listQuery.js'

export const AUTH_REQUESTS_SPEC = {
  columns: {
    id: 'id',
    email: 'email',
    outcome: 'outcome',
    detail: 'detail',
    ip: 'ip',
    createdAt: 'created_at',
  },
  sortable: ['id', 'email', 'outcome', 'ip', 'createdAt'],
  searchable: ['email', 'ip', 'detail'],
  filters: ['outcome'],
  defaultSort: 'createdAt',
  defaultDir: 'desc',
  defaultPageSize: 20,
  maxPageSize: 100,
}

const SELECT = 'id, email, outcome, detail, ip, created_at AS createdAt'

/**
 * @param {object} deps
 * @param {{ query: Function }} deps.db
 * @param {Function} deps.authMiddleware
 * @param {Function} deps.requireRole
 */
export function createAuthRequestsRouter({ db, authMiddleware, requireRole }) {
  const router = Router()

  router.get('/', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
      const result = await runListQuery(db, {
        query: req.query,
        spec: AUTH_REQUESTS_SPEC,
        select: SELECT,
        from: 'auth_request_log',
      })
      res.json(result)
    } catch (err) {
      console.error('[auth-requests] list failed', err.message)
      res.status(500).json({ error: 'common.serverError' })
    }
  })

  return router
}
