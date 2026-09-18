/**
 * Magic-link authentication. No password exists anywhere in this mold.
 *
 * Flow: POST /magic/request {email} -> mail with <publicUrl>/login#<token>
 *       the page reads the fragment and POSTs /magic/verify {token} -> httpOnly cookie.
 * The fragment never reaches a server or a mail scanner; the token is stored as a
 * SHA-256 hash, expires after magicLinkTtlMinutes and is claimed exactly once.
 * Unknown addresses get the same answer as known ones.
 */
import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { hashToken, newRawToken, RAW_TOKEN_RE } from '../lib/tokens.js'
import { magicLinkMessage } from '../lib/mailer.js'

export function clientIp(req) {
  return String(req.headers['cf-connecting-ip'] || req.ip || '').split(',')[0].trim().slice(0, 64)
}

export function createAuthMiddleware(cfg) {
  return function authMiddleware(req, res, next) {
    const token = req.cookies?.[cfg.cookieName]
    if (!token) return res.status(401).json({ error: 'auth.required' })
    try {
      req.user = jwt.verify(token, cfg.jwtSecret)
      return next()
    } catch {
      res.clearCookie(cfg.cookieName)
      return res.status(401).json({ error: 'auth.sessionExpired' })
    }
  }
}

/**
 * Role guard to chain after authMiddleware: requireRole('admin').
 * The role comes from the signed session, itself copied from auth_users at sign-in.
 */
export function requireRole(...roles) {
  return function roleMiddleware(req, res, next) {
    if (req.user && roles.includes(req.user.role)) return next()
    return res.status(403).json({ error: 'auth.forbidden' })
  }
}

/**
 * @param {object} deps
 * @param {ReturnType<import('../config.js').createConfig>} deps.cfg
 * @param {ReturnType<import('../lib/authStore.js').createAuthStore>} deps.store
 * @param {{send: Function}} deps.mailer
 */
export function createAuthRouter({ cfg, store, mailer }) {
  const router = Router()
  const a = cfg.auth

  function setSessionCookie(req, res, user) {
    const token = jwt.sign(user, cfg.jwtSecret, { expiresIn: `${cfg.sessionDays}d` })
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https'
    res.cookie(cfg.cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      maxAge: cfg.sessionDays * 24 * 60 * 60 * 1000,
    })
  }

  async function log(email, outcome, ip, detail) {
    try {
      await store.logRequest({ email, outcome, ip, detail })
    } catch (err) {
      console.error(`[${cfg.appName}] auth log failed`, err.message)
    }
  }

  router.post('/magic/request', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const ip = clientIp(req)
    if (!email || !email.includes('@') || email.length > 190) {
      return res.status(400).json({ error: 'auth.emailRequired' })
    }
    try {
      const [byIp, byEmail] = await Promise.all([
        store.countRecentRequests({ ip, windowMinutes: a.rateWindowMinutes }),
        store.countRecentRequests({ email, windowMinutes: a.rateWindowMinutes }),
      ])
      if (byIp >= a.maxRequestsPerIp || byEmail >= a.maxRequestsPerEmail) {
        await log(email, 'rate_limited', ip)
        return res.status(429).json({ error: 'auth.tooManyRequests' })
      }

      const user = await store.findUser(email)
      if (!user) {
        await log(email, 'not_authorized', ip)
        return res.json({ ok: true, message: 'auth.linkSentIfAllowed' })
      }

      const raw = newRawToken()
      await store.insertToken({ email: user.email, tokenHash: hashToken(raw), ttlMinutes: a.magicLinkTtlMinutes })
      const magicUrl = `${cfg.publicUrl}${a.loginPath}#${raw}`
      const message = magicLinkMessage({
        appName: cfg.appName,
        toName: user.displayName,
        magicUrl,
        ttlMinutes: a.magicLinkTtlMinutes,
      })
      const sent = await mailer.send({ toEmail: user.email, toName: user.displayName, ...message })
      if (!sent.sent) {
        await log(email, 'send_failed', ip, sent.reason)
        return res.status(502).json({ error: 'auth.sendFailed' })
      }
      await log(email, 'link_sent', ip, sent.messageId ? `${mailer.kind} ${sent.messageId}` : null)
      return res.json({ ok: true, message: 'auth.linkSentIfAllowed' })
    } catch (err) {
      console.error(`[${cfg.appName}] magic request`, err)
      return res.status(500).json({ error: 'common.serverError' })
    }
  })

  router.post('/magic/verify', async (req, res) => {
    const raw = String(req.body?.token || '').trim()
    const ip = clientIp(req)
    if (!RAW_TOKEN_RE.test(raw)) return res.status(400).json({ error: 'auth.linkInvalid' })
    try {
      const row = await store.findToken(hashToken(raw))
      if (!row) {
        await log('unknown-token', 'verify_unknown', ip)
        return res.status(400).json({ error: 'auth.linkInvalid' })
      }
      if (row.usedAt) {
        await log(row.email, 'verify_reused', ip)
        return res.status(410).json({ error: 'auth.linkUsed' })
      }
      if (row.expired) {
        await log(row.email, 'verify_expired', ip)
        return res.status(410).json({ error: 'auth.linkExpired' })
      }
      if (!row.user) {
        await log(row.email, 'verify_no_longer_authorized', ip)
        return res.status(403).json({ error: 'auth.noLongerAuthorized' })
      }
      if (!(await store.claimToken(row.id))) {
        await log(row.email, 'verify_reused', ip)
        return res.status(410).json({ error: 'auth.linkUsed' })
      }
      const user = { email: row.user.email, name: row.user.displayName, role: row.user.role }
      setSessionCookie(req, res, user)
      await log(row.email, 'verify_ok', ip)
      return res.json({ ok: true, user })
    } catch (err) {
      console.error(`[${cfg.appName}] magic verify`, err)
      return res.status(500).json({ error: 'common.serverError' })
    }
  })

  router.post('/logout', (_req, res) => {
    res.clearCookie(cfg.cookieName)
    res.json({ ok: true })
  })

  const authMiddleware = createAuthMiddleware(cfg)

  router.get('/me', authMiddleware, async (req, res) => {
    // A session survives only while its address stays on the allowlist.
    const user = await store.findUser(req.user.email).catch(() => null)
    if (!user) {
      res.clearCookie(cfg.cookieName)
      return res.status(401).json({ error: 'auth.accessRevoked' })
    }
    return res.json({ ok: true, user: { email: user.email, name: user.displayName, role: user.role } })
  })

  return router
}
