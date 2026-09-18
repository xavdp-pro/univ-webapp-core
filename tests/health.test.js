import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { buildTestApp } from './helpers/testApp.js'
import { createConfig } from '../server/config.js'
import { createDb } from '../server/lib/db.js'

describe('GET /api/health', () => {
  it('reports db down without failing the request', async () => {
    const { app } = buildTestApp({ dbUp: false })
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, service: 'testapp', db: 'down', realtime: false })
  })

  it('reports db up', async () => {
    const { app } = buildTestApp({ dbUp: true })
    const res = await request(app).get('/api/health')
    expect(res.body.db).toBe('up')
  })

  it('real db module answers false on an unreachable server instead of throwing', async () => {
    // Nothing listens on this port; the pool must fail fast and ping() must swallow it.
    const cfg = createConfig({ DB_HOST: '127.0.0.1', DB_PORT: '1' })
    const db = createDb(cfg)
    await expect(db.ping(2500)).resolves.toBe(false)
    await db.close()
  })

  it('unknown api routes answer json 404', async () => {
    const { app } = buildTestApp()
    const res = await request(app).get('/api/nope')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('common.notFound')
  })

  it('sends security headers', async () => {
    const { app } = buildTestApp()
    const res = await request(app).get('/api/health')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })
})
