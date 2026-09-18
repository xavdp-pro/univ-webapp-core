/**
 * All environment reads live here. Nothing else in server/ touches process.env.
 *
 * The API binds 127.0.0.1 by default on purpose: only the local proxy (Vite in
 * development, the reverse proxy in production) should reach it. Binding
 * 0.0.0.0 exposes the API directly on the VPN, which is the fleet-wide defect
 * this mold fixes. Set HOST explicitly if a fork really needs otherwise.
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const APP_ROOT = path.resolve(HERE, '..')

export const DEFAULT_JWT_SECRET = 'change-me'

function readPackageName() {
  try {
    return JSON.parse(readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')).name || 'webapp'
  } catch {
    return 'webapp'
  }
}

function bool(value, fallback = false) {
  if (value === undefined || value === '') return fallback
  return String(value).toLowerCase() === 'true'
}

function int(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && value !== undefined && value !== '' ? n : fallback
}

/**
 * Builds a config object from an env map. Pure, so tests can feed their own env.
 * @param {NodeJS.ProcessEnv} env
 */
export function createConfig(env = process.env) {
  const appName = env.APP_NAME || readPackageName()
  const nodeEnv = env.NODE_ENV || 'development'
  const port = int(env.PORT, 7700)
  return {
    appName,
    nodeEnv,
    isProduction: nodeEnv === 'production',
    host: env.HOST || '127.0.0.1',
    port,
    publicUrl: (env.PUBLIC_URL || `http://127.0.0.1:${int(env.VITE_PORT, 7701)}`).replace(/\/$/, ''),
    jwtSecret: env.JWT_SECRET || DEFAULT_JWT_SECRET,
    cookieName: env.COOKIE_NAME || `${appName.replace(/[^a-zA-Z0-9_-]/g, '_')}_session`,
    sessionDays: int(env.SESSION_DAYS, 30),
    trustProxy: int(env.TRUST_PROXY, 1),
    serveDist: bool(env.SERVE_DIST),
    realtimeEnabled: bool(env.REALTIME_ENABLED),
    db: {
      host: env.DB_HOST || '127.0.0.1',
      port: int(env.DB_PORT, 3306),
      user: env.DB_USER || appName,
      database: env.DB_NAME || appName,
      password: env.DB_PASSWORD || '',
      passwordFile: env.DB_PASSWORD_FILE || '',
      connectionLimit: int(env.DB_POOL_SIZE, 10),
    },
    auth: {
      // email|Display Name|role,... seeded into auth_users at boot (upsert).
      seedUsers: env.AUTH_USERS || '',
      magicLinkTtlMinutes: int(env.MAGIC_LINK_TTL_MINUTES, 15),
      maxRequestsPerEmail: int(env.MAGIC_MAX_PER_EMAIL, 5),
      maxRequestsPerIp: int(env.MAGIC_MAX_PER_IP, 10),
      rateWindowMinutes: int(env.MAGIC_RATE_WINDOW_MINUTES, 15),
      loginPath: env.LOGIN_PATH || '/login',
    },
    mail: {
      mailjetApiKey: env.MAILJET_API_KEY || '',
      mailjetApiSecret: env.MAILJET_API_SECRET || '',
      fromEmail: env.MAIL_FROM_EMAIL || '',
      fromName: env.MAIL_FROM_NAME || appName,
    },
    rateLimit: {
      apiPerMinute: int(env.RATE_LIMIT_API_PER_MINUTE, 300),
      authPer15Minutes: int(env.RATE_LIMIT_AUTH_PER_15MIN, 30),
    },
  }
}

/**
 * Refuses to run production on a missing or default JWT secret.
 * Throws instead of exiting so the guard is testable; index.js turns it into exit 1.
 */
export function assertProductionSecrets(cfg) {
  if (!cfg.isProduction) return
  if (!cfg.jwtSecret || cfg.jwtSecret === DEFAULT_JWT_SECRET || cfg.jwtSecret.length < 16) {
    throw new Error(`[${cfg.appName}] Refusing to start in production: set a real JWT_SECRET (>= 16 chars) in .env`)
  }
}

export const config = createConfig()
