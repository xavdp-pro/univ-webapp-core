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
      return u && u.active !== false ? { email: u.email, displayName: u.displayName, role: u.role } : null
    },
    async findUserAny(email) {
      const u = users.get(email)
      return u ? { ...u, active: u.active !== false } : null
    },
    async upsertUser(u) {
      users.set(u.email, { active: true, createdAt: new Date(clock.now), updatedAt: new Date(clock.now), ...users.get(u.email), ...u })
    },
    async insertUserIfMissing(u) {
      if (users.has(u.email)) return false
      users.set(u.email, { ...u, active: true, createdAt: new Date(clock.now), updatedAt: new Date(clock.now) })
      return true
    },
    async createUser(u) {
      users.set(u.email, { ...u, active: true, createdAt: new Date(clock.now), updatedAt: new Date(clock.now) })
      return this.findUserAny(u.email)
    },
    async updateUser(email, patch) {
      const u = users.get(email)
      if (!u) return null
      for (const key of ['displayName', 'role', 'active']) if (patch[key] !== undefined) u[key] = patch[key]
      u.updatedAt = new Date(clock.now)
      return this.findUserAny(email)
    },
    /** Same contract as the SQL store: one synchronous step, so it cannot interleave. */
    async updateUserKeepingAnAdmin(email, patch) {
      const others = [...users.values()].filter((u) => u.role === 'admin' && u.active !== false && u.email !== email)
      if (!others.length) return null
      const u = users.get(email)
      for (const key of ['displayName', 'role', 'active']) if (patch[key] !== undefined) u[key] = patch[key]
      u.updatedAt = new Date(clock.now)
      return { ...u }
    },
    async countActiveAdmins() {
      return [...users.values()].filter((u) => u.role === 'admin' && u.active !== false).length
    },
    async insertToken({ email, tokenHash, ttlMinutes }) {
      tokens.push({ id: nextId++, email, tokenHash, expiresAt: new Date(clock.now.getTime() + ttlMinutes * 60_000), usedAt: null })
    },
    async findToken(tokenHash) {
      const row = tokens.find((t) => t.tokenHash === tokenHash)
      if (!row) return null
      return {
        id: row.id,
        email: row.email,
        usedAt: row.usedAt,
        expired: row.expiresAt < clock.now,
        user: await this.findUser(row.email),
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
          && r.outcome === 'requested'
          && r.createdAt.getTime() > since,
      ).length
    },
  }
}
