/**
 * Turns the query string of a list endpoint into safe SQL fragments.
 *
 * Nothing coming from the request is ever interpolated into SQL: the sort
 * column is looked up in an explicit map written by the developer, the
 * direction is `ASC` or `DESC` and nothing else, page and page size are
 * clamped, the search text and filter values travel as bound parameters with
 * `%` and `_` escaped so they cannot widen a LIKE.
 *
 * Wire format, shared with src/components/ui/DataTable.jsx in server mode:
 *   ?page=2&pageSize=20&sort=createdAt&dir=desc&q=text&f_status=open
 *
 * Spec written by the route:
 *   {
 *     columns: { createdAt: 'created_at', email: 'email' },   // key -> SQL expression, the whitelist
 *     sortable: ['createdAt', 'email'],                        // defaults to every key of `columns`
 *     searchable: ['email'],                                   // keys searched by `q` (LIKE)
 *     filters: ['status'],                                     // keys accepted as exact-match `f_<key>`
 *     defaultSort: 'createdAt', defaultDir: 'desc',
 *     defaultPageSize: 20, maxPageSize: 100,
 *   }
 */

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100
export const MAX_TEXT_LENGTH = 200

/** Escape character used in LIKE patterns; `!` is safe under every sql_mode, unlike a backslash. */
export const LIKE_ESCAPE = '!'

/** Neutralises the LIKE wildcards of a user string so it matches literally. */
export function escapeLike(text) {
  return String(text).replace(/[!%_]/g, (c) => LIKE_ESCAPE + c)
}

function toInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(n) ? n : fallback
}

/** A scalar string, trimmed and bounded; a repeated parameter (array) counts as absent. */
function text(value) {
  if (value === undefined || value === null || typeof value === 'object') return ''
  return String(value).trim().slice(0, MAX_TEXT_LENGTH)
}

function normaliseSpec(spec = {}) {
  const columns = spec.columns || {}
  const keys = Object.keys(columns)
  const sortable = (spec.sortable || keys).filter((k) => columns[k])
  const searchable = (spec.searchable || []).filter((k) => columns[k])
  const filters = (spec.filters || []).filter((k) => columns[k])
  const maxPageSize = Math.max(1, toInt(spec.maxPageSize, MAX_PAGE_SIZE))
  const defaultPageSize = Math.min(maxPageSize, Math.max(1, toInt(spec.defaultPageSize, DEFAULT_PAGE_SIZE)))
  const defaultSort = sortable.includes(spec.defaultSort) ? spec.defaultSort : sortable[0] || null
  const defaultDir = spec.defaultDir === 'desc' ? 'desc' : 'asc'
  return { columns, sortable, searchable, filters, maxPageSize, defaultPageSize, defaultSort, defaultDir }
}

/**
 * Reads and clamps the list parameters. Unknown sort keys fall back to the
 * default sort (never to the raw value); unknown filter keys are ignored.
 * @returns {{ page: number, pageSize: number, sort: string|null, dir: 'asc'|'desc', q: string, filters: Record<string,string> }}
 */
export function parseListQuery(query = {}, spec = {}) {
  const s = normaliseSpec(spec)
  const page = Math.max(1, toInt(query.page, 1))
  const pageSize = Math.min(s.maxPageSize, Math.max(1, toInt(query.pageSize, s.defaultPageSize)))
  const wantedSort = text(query.sort)
  const sort = s.sortable.includes(wantedSort) ? wantedSort : s.defaultSort
  const wantedDir = text(query.dir).toLowerCase()
  const dir = wantedDir === 'asc' || wantedDir === 'desc' ? wantedDir : s.defaultDir
  const q = text(query.q)
  const filters = {}
  for (const key of s.filters) {
    const value = text(query[`f_${key}`])
    if (value !== '') filters[key] = value
  }
  return { page, pageSize, sort, dir, q, filters }
}

/**
 * Builds the SQL fragments for a parsed query. `baseWhere` (developer-written,
 * with `?` placeholders bound to `baseParams`) is AND-ed with the filters and
 * the search. `where` starts with `WHERE` or is empty.
 * @returns {{ orderBy: string, limit: number, offset: number, where: string, params: unknown[] }}
 */
export function buildListSql(parsed, spec = {}, { baseWhere = '', baseParams = [] } = {}) {
  const s = normaliseSpec(spec)
  const conditions = []
  const params = []
  if (baseWhere) {
    conditions.push(`(${baseWhere})`)
    params.push(...baseParams)
  }
  for (const [key, value] of Object.entries(parsed.filters || {})) {
    if (!s.filters.includes(key)) continue
    conditions.push(`${s.columns[key]} = ?`)
    params.push(value)
  }
  if (parsed.q && s.searchable.length) {
    const pattern = `%${escapeLike(parsed.q)}%`
    conditions.push(`(${s.searchable.map((k) => `${s.columns[k]} LIKE ? ESCAPE '${LIKE_ESCAPE}'`).join(' OR ')})`)
    for (let i = 0; i < s.searchable.length; i += 1) params.push(pattern)
  }
  const sortKey = s.sortable.includes(parsed.sort) ? parsed.sort : s.defaultSort
  const direction = parsed.dir === 'desc' ? 'DESC' : 'ASC'
  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
    orderBy: sortKey ? `ORDER BY ${s.columns[sortKey]} ${direction}` : '',
    limit: parsed.pageSize,
    offset: (parsed.page - 1) * parsed.pageSize,
  }
}

/**
 * Runs the count and the page in one go and returns what DataTable expects.
 * `select` and `from` are developer-written SQL (never from the request).
 * @param {{ query: Function }} db
 * @returns {Promise<{ rows: object[], total: number, page: number, pageSize: number, sort: string|null, dir: string, q: string }>}
 */
export async function runListQuery(db, { query, spec, select = '*', from, baseWhere, baseParams }) {
  const parsed = parseListQuery(query, spec)
  const sql = buildListSql(parsed, spec, { baseWhere, baseParams })
  const [countRows, rows] = await Promise.all([
    db.query(`SELECT COUNT(*) AS total FROM ${from} ${sql.where}`, sql.params),
    db.query(`SELECT ${select} FROM ${from} ${sql.where} ${sql.orderBy} LIMIT ? OFFSET ?`, [...sql.params, sql.limit, sql.offset]),
  ])
  return {
    rows,
    total: Number(countRows[0]?.total || 0),
    page: parsed.page,
    pageSize: parsed.pageSize,
    sort: parsed.sort,
    dir: parsed.dir,
    q: parsed.q,
  }
}
