/**
 * Builds the Express app from explicit dependencies. index.js wires the real
 * ones; tests wire an in-memory store and a fake mailer.
 */
import path from 'node:path'
import { existsSync } from 'node:fs'
import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import cookieParser from 'cookie-parser'
import { APP_ROOT } from './config.js'
import { createAuthRouter, createAuthMiddleware, requireRole } from './routes/auth.js'
import { createAuthRequestsRouter } from './routes/authRequests.js'

/**
 * @param {object} deps
 * @param {ReturnType<import('./config.js').createConfig>} deps.cfg
 * @param {{ping: Function, query: Function}} deps.db
 * @param {ReturnType<import('./lib/authStore.js').createAuthStore>} deps.store
 * @param {{send: Function, kind: string}} deps.mailer
 */
export function createApp({ cfg, db, store, mailer }) {
  const app = express()
  app.disable('x-powered-by')
  // The API sits behind a local proxy; trust it so rate limits see client IPs.
  app.set('trust proxy', cfg.trustProxy)

  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }))
  app.use(express.json({ limit: '2mb' }))
  app.use(cookieParser())

  app.use('/api', rateLimit({
    windowMs: 60 * 1000,
    limit: cfg.rateLimit.apiPerMinute,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'common.tooManyRequests' },
  }))
  app.use('/api/auth', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: cfg.rateLimit.authPer15Minutes,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'auth.tooManyRequests' },
  }))

  app.get('/api/health', async (_req, res) => {
    const dbUp = await db.ping()
    res.json({ ok: true, service: cfg.appName, db: dbUp ? 'up' : 'down', realtime: cfg.realtimeEnabled, ts: Date.now() })
  })

  app.get('/api/meta', (_req, res) => {
    res.json({ appName: cfg.appName, realtimeEnabled: cfg.realtimeEnabled })
  })

  app.use('/api/auth', createAuthRouter({ cfg, store, mailer }))

  // Business routes of a fork go here, behind authMiddleware.
  const authMiddleware = createAuthMiddleware(cfg)
  app.get('/api/ping', authMiddleware, (req, res) => {
    res.json({ ok: true, user: req.user.email, ts: Date.now() })
  })
  // Example list endpoint (server-mode DataTable): the magic-link request log, admin only.
  app.use('/api/auth-requests', createAuthRequestsRouter({ db, authMiddleware, requireRole }))

  app.use('/api', (_req, res) => res.status(404).json({ error: 'common.notFound' }))

  if (cfg.serveDist) {
    const dist = path.join(APP_ROOT, 'dist')
    if (!existsSync(dist)) {
      console.warn(`[${cfg.appName}] SERVE_DIST=true but ${dist} does not exist; run npm run build`)
    }
    app.use(express.static(dist, { index: false, maxAge: '1h' }))
    // SPA fallback: every non-API path opens index.html and the router takes over.
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
  }

  return app
}
