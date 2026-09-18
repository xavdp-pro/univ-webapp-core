/**
 * Persistence used by the auth routes. Routes only ever call these methods, so a
 * test can hand them an in-memory implementation (tests/helpers/memoryAuthStore.js)
 * and a fork can swap the backend without touching the HTTP layer.
 *
 * All timestamps are UTC, computed in SQL, so the window arithmetic does not
 * depend on the Node process clock or timezone.
 */

const USER_SELECT = 'email, display_name AS displayName, role, active, created_at AS createdAt, updated_at AS updatedAt'

function toUser(row) {
  if (!row) return null
  return { ...row, active: Boolean(Number(row.active)) }
}

/** The SET clause of a user patch; only these three columns can ever be written. */
function userSets(patch) {
  const sets = []
  const params = []
  if (patch.displayName !== undefined) {
    sets.push('display_name = ?')
    params.push(patch.displayName)
  }
  if (patch.role !== undefined) {
    sets.push('role = ?')
    params.push(patch.role)
  }
  if (patch.active !== undefined) {
    sets.push('active = ?')
    params.push(patch.active ? 1 : 0)
  }
  return { sets, params }
}

/** @param {ReturnType<import('./db.js').createDb>} db */
export function createAuthStore(db) {
  return {
    /** An allowed user: present and active. Inactive users are invisible to sign-in and /me. */
    async findUser(email) {
      const rows = await db.query(
        'SELECT email, display_name AS displayName, role FROM auth_users WHERE email = ? AND active = 1 LIMIT 1',
        [email],
      )
      return rows[0] || null
    },

    /** Any row, active or not, with the management fields (admin page). */
    async findUserAny(email) {
      const rows = await db.query(`SELECT ${USER_SELECT} FROM auth_users WHERE email = ? LIMIT 1`, [email])
      return toUser(rows[0])
    },

    async upsertUser({ email, displayName, role }) {
      await db.query(
        `INSERT INTO auth_users (email, display_name, role) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), role = VALUES(role)`,
        [email, displayName, role],
      )
    },

    /** Inserts when no row exists for the address (any status); resolves true when it did insert. */
    async insertUserIfMissing({ email, displayName, role }) {
      const result = await db.query(
        'INSERT IGNORE INTO auth_users (email, display_name, role) VALUES (?, ?, ?)',
        [email, displayName, role],
      )
      return result.affectedRows === 1
    },

    async createUser({ email, displayName, role }) {
      await db.query('INSERT INTO auth_users (email, display_name, role, active) VALUES (?, ?, ?, 1)', [email, displayName, role])
      return this.findUserAny(email)
    },

    /** Updates the given fields only (displayName, role, active) and returns the row. */
    async updateUser(email, patch) {
      const { sets, params } = userSets(patch)
      if (sets.length) await db.query(`UPDATE auth_users SET ${sets.join(', ')} WHERE email = ?`, [...params, email])
      return this.findUserAny(email)
    },

    /**
     * Demotes or deactivates an admin only if another active admin remains, as one
     * atomic step: the active admin rows are locked (FOR UPDATE) for the whole
     * transaction, so two admins removing each other at the same moment are
     * serialised and the second one sees a single admin left.
     * Resolves the updated row, or null when the change would leave no admin.
     */
    async updateUserKeepingAnAdmin(email, patch) {
      const attempt = () => db.transaction(async (tx) => {
        const admins = await tx.query(
          "SELECT email FROM auth_users WHERE role = 'admin' AND active = 1 ORDER BY email FOR UPDATE",
        )
        if (!admins.some((r) => r.email !== email)) return false
        const { sets, params } = userSets(patch)
        if (sets.length) await tx.query(`UPDATE auth_users SET ${sets.join(', ')} WHERE email = ?`, [...params, email])
        return true
      })
      let done
      try {
        done = await attempt()
      } catch (err) {
        // Two lock waits can still meet in a deadlock; InnoDB rolled one back, retry it once.
        if (err?.code !== 'ER_LOCK_DEADLOCK') throw err
        done = await attempt()
      }
      return done ? this.findUserAny(email) : null
    },

    async countActiveAdmins() {
      const rows = await db.query("SELECT COUNT(*) AS n FROM auth_users WHERE role = 'admin' AND active = 1")
      return Number(rows[0]?.n || 0)
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
         LEFT JOIN auth_users u ON u.email = t.email AND u.active = 1
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

    /**
     * Counts link requests for an email or an ip within the window. Each accepted
     * request logs `requested` before the response, so the count never waits for
     * the lookup or the mail that follow it.
     */
    async countRecentRequests({ email, ip, windowMinutes }) {
      const column = email ? 'email' : 'ip'
      const rows = await db.query(
        `SELECT COUNT(*) AS n FROM auth_request_log
         WHERE ${column} = ?
           AND outcome = 'requested'
           AND created_at > (UTC_TIMESTAMP() - INTERVAL ? MINUTE)`,
        [email || ip, windowMinutes],
      )
      return Number(rows[0]?.n || 0)
    },
  }
}
