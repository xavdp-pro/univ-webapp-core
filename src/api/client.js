/**
 * The only way the front talks to the API: fetch, JSON bodies, cookie session.
 * A 401 emits an `auth:unauthorized` event with the server's reason; the auth
 * provider listens and sends the user back to the login page with that reason.
 * Errors carry `status` and `code` (a translation key when the API sent one).
 */
const BASE = '/api'
const DEFAULT_TIMEOUT_MS = 15_000

export class ApiError extends Error {
  constructor(message, { status = 0, code = '' } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export const UNAUTHORIZED_EVENT = 'auth:unauthorized'

export async function request(path, { method = 'GET', body, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, silent401 = false } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const code = typeof data.error === 'string' ? data.error : ''
      if (res.status === 401 && !silent401) {
        window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, { detail: { reason: code || 'auth.required' } }))
      }
      throw new ApiError(code || `common.httpError`, { status: res.status, code })
    }
    return data
  } catch (err) {
    if (err.name === 'AbortError') throw new ApiError('common.timeout', { status: 0, code: 'common.timeout' })
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  health: () => request('/health'),
  meta: () => request('/meta'),
  me: () => request('/auth/me', { silent401: true }),
  requestMagicLink: (email) => request('/auth/magic/request', { method: 'POST', body: { email } }),
  verifyMagicLink: (token) => request('/auth/magic/verify', { method: 'POST', body: { token } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  ping: () => request('/ping'),
}
