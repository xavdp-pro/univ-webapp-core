/**
 * In-memory implementation of server/lib/authStore.js for tests.
 * `clock` is a mutable { now: Date } so a test can jump past a token's TTL.
 */
export function createMemoryAuthStore({ clock = { now: new Date() } } = {}) {
  const users = new Map()
  const tokens = []
  const log = []
  let nextId = 1

  return {
    clock,
    users,
    tokens,
    log,

    async findUser(email) {
      const u = users.get(email)
      return u ? { email: u.email, displayName: u.displayName, role: u.role } : null
    },
    async upsertUser(u) {
      users.set(u.email, { ...u })
    },
    async insertToken({ email, tokenHash, ttlMinutes }) {
      tokens.push({ id: nextId++, email, tokenHash, expiresAt: new Date(clock.now.getTime() + ttlMinutes * 60_000), usedAt: null })
    },
    async findToken(tokenHash) {
      const row = tokens.find((t) => t.tokenHash === tokenHash)
      if (!row) return null
      const u = users.get(row.email)
      return {
        id: row.id,
        email: row.email,
        usedAt: row.usedAt,
        expired: row.expiresAt < clock.now,
        user: u ? { email: u.email, displayName: u.displayName, role: u.role } : null,
      }
    },
    async claimToken(id) {
      const row = tokens.find((t) => t.id === id)
      if (!row || row.usedAt) return false
      row.usedAt = new Date(clock.now)
      return true
    },
    async logRequest({ email, outcome, ip, detail = null }) {
      log.push({ email, outcome, ip, detail, createdAt: new Date(clock.now) })
    },
    async countRecentRequests({ email, ip, windowMinutes }) {
      const since = clock.now.getTime() - windowMinutes * 60_000
      return log.filter(
        (r) => (email ? r.email === email : r.ip === ip)
          && ['link_sent', 'not_authorized', 'send_failed'].includes(r.outcome)
          && r.createdAt.getTime() > since,
      ).length
    },
  }
}
