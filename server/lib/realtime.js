/**
 * Optional Socket.IO layer. Mounted only when REALTIME_ENABLED=true.
 * Sockets authenticate with the same httpOnly session cookie as the API.
 */
import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'

function parseCookies(header) {
  const out = {}
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const k = part.slice(0, i).trim()
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim())
    } catch {
      out[k] = part.slice(i + 1).trim()
    }
  }
  return out
}

let io = null

export function initRealtime(httpServer, cfg) {
  io = new Server(httpServer, { path: '/socket.io' })

  io.use((socket, next) => {
    try {
      const token = parseCookies(socket.handshake.headers.cookie)[cfg.cookieName]
      if (!token) return next(new Error('auth.required'))
      const user = jwt.verify(token, cfg.jwtSecret)
      socket.user = { email: String(user.email).toLowerCase(), name: user.name || user.email, role: user.role }
      return next()
    } catch {
      return next(new Error('auth.sessionExpired'))
    }
  })

  io.on('connection', (socket) => {
    socket.join('lobby')
    socket.emit('hello', { email: socket.user.email, ts: Date.now() })
  })

  return io
}

/** Broadcasts to every connected client; no-op when realtime is off. */
export function broadcast(event, payload) {
  if (io) io.to('lobby').emit(event, payload)
}
