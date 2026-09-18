/**
 * The only way the front talks to the API: fetch, JSON bodies, cookie session.
 * A 401 emits an `auth:unauthorized` event with the server's reason; the auth
 * provider listens and sends the user back to the login page with that reason.
 * Errors carry `status` and `code` (a translation key when the API sent one).
 */
import { toQueryString } from '../components/ui/dataTableUtils'

const BASE = '/api'
const DEFAULT_TIMEOUT_MS = 15_000

export class ApiError extends Error {
  /** `fields` maps a field name to a translation key when the API refused a form ({ error, fields }). */
  constructor(message, { status = 0, code = '', fields = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
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
      const fields = data.fields && typeof data.fields === 'object' ? data.fields : null
      throw new ApiError(code || `common.httpError`, { status: res.status, code, fields })
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
  /** Generic list call for DataTable in server mode: GET <path>?page=…&sort=… -> { rows, total }. */
  list: (path, params) => {
    const qs = toQueryString(params)
    return request(qs ? `${path}?${qs}` : path)
  },
  listAuthRequests: (params) => api.list('/auth-requests', params),
  /** Allowed users (admin): list, create, update, deactivate. */
  listUsers: (params) => api.list('/users', params),
  createUser: (user) => request('/users', { method: 'POST', body: user }),
  updateUser: (email, patch) => request(`/users/${encodeURIComponent(email)}`, { method: 'PATCH', body: patch }),
  removeUser: (email) => request(`/users/${encodeURIComponent(email)}`, { method: 'DELETE' }),
}
