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

/**
 * The client address used by every limiter and written to the request log.
 * `req.ip` follows the `trust proxy` hop count (TRUST_PROXY), so a client cannot
 * pick it by sending X-Forwarded-For. The Cloudflare header is honoured only
 * when TRUST_CLOUDFLARE_IP=true, i.e. when the origin is reachable through
 * Cloudflare alone (a tunnel): anywhere else a client could set it freely.
 */
export function clientIp(req, trustCloudflareIp = false) {
  const cf = trustCloudflareIp ? req.headers['cf-connecting-ip'] : ''
  const value = typeof cf === 'string' && cf ? cf : req.ip
  return String(value || '').split(',')[0].trim().slice(0, 64)
}

/**
 * Checks the signed cookie, then reads the user again from the database on every
 * request: a deactivated user is out at once, and the role used by requireRole is
 * the current one, not the one copied into the cookie at sign-in.
 * @param {ReturnType<import('../config.js').createConfig>} cfg
 * @param {{ findUser: Function }} store
 */
export function createAuthMiddleware(cfg, store) {
  if (!store || typeof store.findUser !== 'function') throw new Error('createAuthMiddleware needs the auth store')
  return async function authMiddleware(req, res, next) {
    const token = req.cookies?.[cfg.cookieName]
    if (!token) return res.status(401).json({ error: 'auth.required' })
    let claims
    try {
      claims = jwt.verify(token, cfg.jwtSecret, { algorithms: ['HS256'] })
    } catch {
      res.clearCookie(cfg.cookieName)
      return res.status(401).json({ error: 'auth.sessionExpired' })
    }
    let user
    try {
      user = await store.findUser(String(claims.email || '').toLowerCase())
    } catch (err) {
      console.error(`[${cfg.appName}] session lookup failed`, err.message)
      return res.status(503).json({ error: 'common.serverError' })
    }
    if (!user) {
      res.clearCookie(cfg.cookieName)
      return res.status(401).json({ error: 'auth.accessRevoked' })
    }
    req.user = { email: user.email, name: user.displayName, role: user.role }
    return next()
  }
}

/**
 * Role guard to chain after authMiddleware: requireRole('admin').
 * The role is the one authMiddleware has just read from auth_users.
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
  const ipOf = (req) => clientIp(req, cfg.trustCloudflareIp)
  // Link requests finish after the response (see /magic/request); tests await them.
  const pending = new Set()
  router.settle = () => Promise.allSettled([...pending])

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

  /**
   * The answer is the same, and leaves at the same moment, whether the address is
   * allowed or not: the lookup, the token and the mail happen after the response,
   * so neither the status nor the timing tells who is on the allowlist. A mail
   * failure is therefore only logged (`send_failed`), never returned.
   */
  async function sendLink(email, ip) {
    const user = await store.findUser(email)
    if (!user) {
      await log(email, 'not_authorized', ip)
      return
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
      return
    }
    await log(email, 'link_sent', ip, sent.messageId ? `${mailer.kind} ${sent.messageId}` : null)
  }

  router.post('/magic/request', async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
    const ip = ipOf(req)
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
      // Counted by the limiters at once, before any lookup.
      await store.logRequest({ email, outcome: 'requested', ip })
    } catch (err) {
      console.error(`[${cfg.appName}] magic request`, err)
      return res.status(500).json({ error: 'common.serverError' })
    }
    res.json({ ok: true, message: 'auth.linkSentIfAllowed' })
    const job = sendLink(email, ip)
      .catch(async (err) => {
        console.error(`[${cfg.appName}] magic request (after response)`, err)
        await log(email, 'send_failed', ip, 'internal_error')
      })
      .finally(() => pending.delete(job))
    pending.add(job)
    return undefined
  })

  router.post('/magic/verify', async (req, res) => {
    const raw = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
    const ip = ipOf(req)
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

  const authMiddleware = createAuthMiddleware(cfg, store)

  // authMiddleware has already re-read the user: a revoked address never gets here.
  router.get('/me', authMiddleware, (req, res) => res.json({ ok: true, user: req.user }))

  return router
}
