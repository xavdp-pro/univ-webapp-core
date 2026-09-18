import { createHash, randomBytes } from 'node:crypto'

/** Tokens are stored hashed: a leaked table cannot be replayed. */
export function hashToken(raw) {
  return createHash('sha256').update(String(raw)).digest('hex')
}

export function newRawToken() {
  return randomBytes(32).toString('hex')
}

export const RAW_TOKEN_RE = /^[a-f0-9]{64}$/

/**
 * Parses AUTH_USERS="email|Display Name|role,email2|Name2|role2".
 * Unknown parts fall back to the local part of the address and role "member".
 */
export function parseAuthUsers(raw) {
  if (!raw || !String(raw).trim()) return []
  return String(raw)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [email, displayName, role] = part.split('|').map((s) => s.trim())
      if (!email || !email.includes('@')) return null
      return {
        email: email.toLowerCase(),
        displayName: displayName || email.split('@')[0],
        role: role || 'member',
      }
    })
    .filter(Boolean)
}
