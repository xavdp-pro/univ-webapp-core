/**
 * MariaDB access through mysql2. The pool is created lazily, so the API boots
 * even when the database is down: callers get an error per query and
 * /api/health reports `db: "down"` instead of the process crashing.
 */
import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'

function resolvePassword(dbCfg) {
  if (dbCfg.password) return dbCfg.password
  if (dbCfg.passwordFile) {
    // Host convention: /apps/<name>/etc/mysql/localhost/passwd, outside the repo.
    return readFileSync(dbCfg.passwordFile, 'utf8').trim()
  }
  return ''
}

/**
 * @param {ReturnType<import('../config.js').createConfig>} cfg
 */
export function createDb(cfg) {
  let pool = null

  function getPool() {
    if (!pool) {
      pool = mysql.createPool({
        host: cfg.db.host,
        port: cfg.db.port,
        user: cfg.db.user,
        password: resolvePassword(cfg.db),
        database: cfg.db.database,
        waitForConnections: true,
        connectionLimit: cfg.db.connectionLimit,
        timezone: '+00:00',
        connectTimeout: 3000,
      })
    }
    return pool
  }

  return {
    /** Runs a parameterised query and returns rows (or the result packet). */
    async query(sql, params = []) {
      const [rows] = await getPool().query(sql, params)
      return rows
    },
    /**
     * Runs `fn(tx)` inside one transaction on one connection; `tx.query` has the
     * same shape as `query`. Commits when fn resolves, rolls back when it throws.
     */
    async transaction(fn) {
      const conn = await getPool().getConnection()
      try {
        await conn.beginTransaction()
        const tx = {
          async query(sql, params = []) {
            const [rows] = await conn.query(sql, params)
            return rows
          },
        }
        const result = await fn(tx)
        await conn.commit()
        return result
      } catch (err) {
        await conn.rollback().catch(() => {})
        throw err
      } finally {
        conn.release()
      }
    },
    /** Resolves true when the database answers, false otherwise. Never throws. */
    async ping(timeoutMs = 2000) {
      try {
        await Promise.race([
          getPool().query('SELECT 1'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('db ping timeout')), timeoutMs)),
        ])
        return true
      } catch {
        return false
      }
    },
    async close() {
      if (pool) await pool.end().catch(() => {})
      pool = null
    },
  }
}
