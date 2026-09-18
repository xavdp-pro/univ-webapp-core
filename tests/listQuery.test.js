import { describe, expect, it } from 'vitest'
import { buildListSql, escapeLike, parseListQuery, runListQuery, MAX_PAGE_SIZE } from '../server/lib/listQuery.js'

const spec = {
  columns: { id: 'id', email: 'email', outcome: 'outcome', createdAt: 'created_at' },
  sortable: ['id', 'email', 'createdAt'],
  searchable: ['email', 'outcome'],
  filters: ['outcome'],
  defaultSort: 'createdAt',
  defaultDir: 'desc',
  defaultPageSize: 20,
}

describe('listQuery: parsing', () => {
  it('applies the defaults on an empty query', () => {
    expect(parseListQuery({}, spec)).toEqual({ page: 1, pageSize: 20, sort: 'createdAt', dir: 'desc', q: '', filters: {} })
  })

  it('accepts a whitelisted sort and a direction', () => {
    const p = parseListQuery({ sort: 'email', dir: 'ASC' }, spec)
    expect(p.sort).toBe('email')
    expect(p.dir).toBe('asc')
  })

  it('refuses a sort key outside the whitelist, even a real column name', () => {
    expect(parseListQuery({ sort: 'outcome' }, spec).sort).toBe('createdAt')
    expect(parseListQuery({ sort: 'created_at' }, spec).sort).toBe('createdAt')
    expect(parseListQuery({ sort: 'id; DROP TABLE auth_users' }, spec).sort).toBe('createdAt')
    expect(parseListQuery({ sort: ['email', 'id'] }, spec).sort).toBe('createdAt')
  })

  it('neutralises an injection attempt in the direction', () => {
    expect(parseListQuery({ dir: 'desc; DELETE FROM x' }, spec).dir).toBe('desc')
    expect(parseListQuery({ dir: 'ASC -- ' }, spec).dir).toBe('desc')
    expect(parseListQuery({ dir: 'up' }, spec).dir).toBe('desc')
  })

  it('clamps page and page size', () => {
    expect(parseListQuery({ page: '0', pageSize: '0' }, spec)).toMatchObject({ page: 1, pageSize: 1 })
    expect(parseListQuery({ page: '-3', pageSize: '-1' }, spec)).toMatchObject({ page: 1, pageSize: 1 })
    expect(parseListQuery({ page: 'abc', pageSize: 'x' }, spec)).toMatchObject({ page: 1, pageSize: 20 })
    expect(parseListQuery({ pageSize: '5000' }, spec).pageSize).toBe(MAX_PAGE_SIZE)
    expect(parseListQuery({ pageSize: '50' }, { ...spec, maxPageSize: 25 }).pageSize).toBe(25)
    expect(parseListQuery({ page: '3.9' }, spec).page).toBe(3)
  })

  it('keeps only declared filters and trims text', () => {
    const p = parseListQuery({ f_outcome: ' link_sent ', f_email: 'x', outcome: 'y', q: '  hi  ' }, spec)
    expect(p.filters).toEqual({ outcome: 'link_sent' })
    expect(p.q).toBe('hi')
  })

  it('truncates over-long text', () => {
    expect(parseListQuery({ q: 'a'.repeat(1000) }, spec).q).toHaveLength(200)
  })
})

describe('listQuery: SQL fragments', () => {
  it('builds order, limit and offset from the parsed query', () => {
    const sql = buildListSql(parseListQuery({ page: '3', pageSize: '10', sort: 'email', dir: 'asc' }, spec), spec)
    expect(sql).toEqual({ where: '', params: [], orderBy: 'ORDER BY email ASC', limit: 10, offset: 20 })
  })

  it('never lets request text reach the ORDER BY', () => {
    const evil = { sort: "email) ; DROP TABLE auth_users; --", dir: 'DESC) --' }
    const sql = buildListSql(parseListQuery(evil, spec), spec)
    expect(sql.orderBy).toBe('ORDER BY created_at DESC')
    expect(JSON.stringify(sql)).not.toMatch(/DROP|--/)
  })

  it('binds the search as escaped LIKE parameters over the searchable columns', () => {
    const sql = buildListSql(parseListQuery({ q: "50%_off' OR 1=1 --" }, spec), spec)
    expect(sql.where).toBe("WHERE (email LIKE ? ESCAPE '!' OR outcome LIKE ? ESCAPE '!')")
    expect(sql.params).toEqual(["%50!%!_off' OR 1=1 --%", "%50!%!_off' OR 1=1 --%"])
    expect(sql.where).not.toContain('OR 1=1')
  })

  it('escapes %, _ and the escape character itself', () => {
    expect(escapeLike('a%b_c!d')).toBe('a!%b!_c!!d')
  })

  it('binds filters and the base where clause', () => {
    const sql = buildListSql(
      parseListQuery({ f_outcome: "x' OR 1=1", q: 'me' }, spec),
      spec,
      { baseWhere: 'created_at > ?', baseParams: ['2026-01-01'] },
    )
    expect(sql.where).toBe("WHERE (created_at > ?) AND outcome = ? AND (email LIKE ? ESCAPE '!' OR outcome LIKE ? ESCAPE '!')")
    expect(sql.params).toEqual(['2026-01-01', "x' OR 1=1", '%me%', '%me%'])
  })

  it('ignores a search when nothing is searchable and a sort when nothing is sortable', () => {
    const bare = { columns: { id: 'id' }, sortable: [] }
    const sql = buildListSql(parseListQuery({ q: 'x', sort: 'id' }, bare), bare)
    expect(sql).toEqual({ where: '', params: [], orderBy: '', limit: 20, offset: 0 })
  })
})

describe('listQuery: runListQuery', () => {
  it('runs a count and a page with bound parameters and returns { rows, total }', async () => {
    const calls = []
    const db = {
      async query(sql, params) {
        calls.push({ sql, params })
        return /COUNT/.test(sql) ? [{ total: 42 }] : [{ id: 1 }, { id: 2 }]
      },
    }
    const out = await runListQuery(db, {
      query: { page: '2', pageSize: '2', q: 'a_b', sort: 'id', dir: 'asc' },
      spec,
      select: 'id, email',
      from: 'auth_request_log',
    })
    expect(out).toEqual({ rows: [{ id: 1 }, { id: 2 }], total: 42, page: 2, pageSize: 2, sort: 'id', dir: 'asc', q: 'a_b' })
    expect(calls).toHaveLength(2)
    expect(calls[0].sql).toBe("SELECT COUNT(*) AS total FROM auth_request_log WHERE (email LIKE ? ESCAPE '!' OR outcome LIKE ? ESCAPE '!')")
    expect(calls[0].params).toEqual(['%a!_b%', '%a!_b%'])
    expect(calls[1].sql).toBe("SELECT id, email FROM auth_request_log WHERE (email LIKE ? ESCAPE '!' OR outcome LIKE ? ESCAPE '!') ORDER BY id ASC LIMIT ? OFFSET ?")
    expect(calls[1].params).toEqual(['%a!_b%', '%a!_b%', 2, 2])
  })
})
