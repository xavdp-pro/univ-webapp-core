import { describe, expect, it } from 'vitest'
import { assertProductionSecrets, createConfig, DEFAULT_JWT_SECRET } from '../server/config.js'

describe('config guard', () => {
  it('binds 127.0.0.1 by default, never 0.0.0.0', () => {
    const cfg = createConfig({})
    expect(cfg.host).toBe('127.0.0.1')
  })

  it('refuses production with the default JWT secret', () => {
    const cfg = createConfig({ NODE_ENV: 'production' })
    expect(cfg.jwtSecret).toBe(DEFAULT_JWT_SECRET)
    expect(() => assertProductionSecrets(cfg)).toThrow(/JWT_SECRET/)
  })

  it('refuses production with a short secret', () => {
    expect(() => assertProductionSecrets(createConfig({ NODE_ENV: 'production', JWT_SECRET: 'short' }))).toThrow(/JWT_SECRET/)
  })

  it('accepts production with a real secret', () => {
    expect(() => assertProductionSecrets(createConfig({ NODE_ENV: 'production', JWT_SECRET: 'a-real-secret-of-decent-length' }))).not.toThrow()
  })

  it('tolerates the default secret outside production', () => {
    expect(() => assertProductionSecrets(createConfig({ NODE_ENV: 'development' }))).not.toThrow()
  })

  it('derives cookie and database names from the app name', () => {
    const cfg = createConfig({ APP_NAME: 'my-app' })
    expect(cfg.cookieName).toBe('my-app_session')
    expect(cfg.db.user).toBe('my-app')
    expect(cfg.db.database).toBe('my-app')
  })

  it('reads flags as booleans', () => {
    expect(createConfig({}).realtimeEnabled).toBe(false)
    expect(createConfig({ REALTIME_ENABLED: 'true' }).realtimeEnabled).toBe(true)
    expect(createConfig({ SERVE_DIST: 'TRUE' }).serveDist).toBe(true)
  })
})
