/**
 * Persistence used by the auth routes. Routes only ever call these methods, so a
 * test can hand them an in-memory implementation (tests/helpers/memoryAuthStore.js)
 * and a fork can swap the backend without touching the HTTP layer.
 *
 * All timestamps are UTC, computed in SQL, so the window arithmetic does not
 * depend on the Node process clock or timezone.
 */

/** @param {ReturnType<import('./db.js').createDb>} db */
export function createAuthStore(db) {
  return {
    async findUser(email) {
      const rows = await db.query(
        'SELECT email, display_name AS displayName, role FROM auth_users WHERE email = ? LIMIT 1',
        [email],
      )
      return rows[0] || null
    },

    async upsertUser({ email, displayName, role }) {
      await db.query(
        `INSERT INTO auth_users (email, display_name, role) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), role = VALUES(role)`,
        [email, displayName, role],
      )
    },

    async insertToken({ email, tokenHash, ttlMinutes }) {
      await db.query(
        `INSERT INTO auth_magic_tokens (email, token_hash, expires_at)
         VALUES (?, ?, UTC_TIMESTAMP() + INTERVAL ? MINUTE)`,
        [email, tokenHash, ttlMinutes],
      )
    },

    /** Returns { id, email, expired, usedAt, user } or null. */
    async findToken(tokenHash) {
      const rows = await db.query(
        `SELECT t.id, t.email, t.used_at AS usedAt, (t.expires_at < UTC_TIMESTAMP()) AS expired,
                u.display_name AS displayName, u.role
         FROM auth_magic_tokens t
         LEFT JOIN auth_users u ON u.email = t.email
         WHERE t.token_hash = ? LIMIT 1`,
        [tokenHash],
      )
      const row = rows[0]
      if (!row) return null
      return {
        id: row.id,
        email: row.email,
        usedAt: row.usedAt,
        expired: Boolean(Number(row.expired)),
        user: row.displayName ? { email: row.email, displayName: row.displayName, role: row.role } : null,
      }
    },

    /** Marks a token used exactly once; resolves false when it was already used. */
    async claimToken(id) {
      const result = await db.query(
        'UPDATE auth_magic_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ? AND used_at IS NULL',
        [id],
      )
      return result.affectedRows === 1
    },

    async logRequest({ email, outcome, ip, detail = null }) {
      await db.query(
        'INSERT INTO auth_request_log (email, outcome, detail, ip) VALUES (?, ?, ?, ?)',
        [String(email).slice(0, 190), outcome, detail ? String(detail).slice(0, 500) : null, ip],
      )
    },

    /** Counts link requests for an email or an ip within the window. */
    async countRecentRequests({ email, ip, windowMinutes }) {
      const column = email ? 'email' : 'ip'
      const rows = await db.query(
        `SELECT COUNT(*) AS n FROM auth_request_log
         WHERE ${column} = ?
           AND outcome IN ('link_sent', 'not_authorized', 'send_failed')
           AND created_at > (UTC_TIMESTAMP() - INTERVAL ? MINUTE)`,
        [email || ip, windowMinutes],
      )
      return Number(rows[0]?.n || 0)
    },
  }
}
