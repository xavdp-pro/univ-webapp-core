import { describe, expect, it } from 'vitest'
import {
  applyClientQuery,
  buildListParams,
  clampPage,
  compareValues,
  filterRows,
  getCellValue,
  nextSort,
  pageCount,
  pageRange,
  paginateRows,
  searchRows,
  sortRows,
  toQueryString,
} from '../src/components/ui/dataTableUtils.js'

const columns = [
  { key: 'ref', sortable: true },
  { key: 'label', sortable: true },
  { key: 'amount', sortable: true, searchable: false },
  { key: 'owner', accessor: 'meta.owner' },
  { key: 'when', accessor: (row) => new Date(row.when), sortable: true },
]

const rows = [
  { id: 1, ref: 'item 10', label: 'Épée', amount: 30, meta: { owner: 'x' }, when: '2026-03-01' },
  { id: 2, ref: 'item 2', label: 'eclair', amount: 5, meta: { owner: 'y' }, when: '2026-01-01' },
  { id: 3, ref: 'item 1', label: 'Zebra', amount: null, meta: {}, when: '2026-02-01' },
]

describe('dataTableUtils: cells and comparison', () => {
  it('reads plain keys, dotted paths and accessor functions', () => {
    expect(getCellValue(rows[0], columns[0])).toBe('item 10')
    expect(getCellValue(rows[0], columns[3])).toBe('x')
    expect(getCellValue(rows[2], columns[3])).toBeUndefined()
    expect(getCellValue(rows[0], columns[4])).toBeInstanceOf(Date)
  })

  it('compares numbers numerically, text naturally and sinks empty values', () => {
    expect(compareValues(2, 10)).toBeLessThan(0)
    expect(compareValues('item 2', 'item 10')).toBeLessThan(0)
    expect(compareValues('eclair', 'Épée')).toBeLessThan(0)
    expect(compareValues(null, 1)).toBeGreaterThan(0)
    expect(compareValues(1, undefined)).toBeLessThan(0)
    expect(compareValues('', null)).toBe(0)
    expect(compareValues(new Date('2026-01-01'), new Date('2026-02-01'))).toBeLessThan(0)
  })
})

describe('dataTableUtils: sorting', () => {
  it('cycles none -> asc -> desc -> none and restarts on another column', () => {
    expect(nextSort(null, 'a')).toEqual({ key: 'a', dir: 'asc' })
    expect(nextSort({ key: 'a', dir: 'asc' }, 'a')).toEqual({ key: 'a', dir: 'desc' })
    expect(nextSort({ key: 'a', dir: 'desc' }, 'a')).toBeNull()
    expect(nextSort({ key: 'a', dir: 'desc' }, 'b')).toEqual({ key: 'b', dir: 'asc' })
  })

  it('sorts a copy with natural order, both directions, nulls last', () => {
    expect(sortRows(rows, columns, { key: 'ref', dir: 'asc' }).map((r) => r.id)).toEqual([3, 2, 1])
    expect(sortRows(rows, columns, { key: 'ref', dir: 'desc' }).map((r) => r.id)).toEqual([1, 2, 3])
    expect(sortRows(rows, columns, { key: 'amount', dir: 'asc' }).map((r) => r.id)).toEqual([2, 1, 3])
    expect(sortRows(rows, columns, { key: 'when', dir: 'asc' }).map((r) => r.id)).toEqual([2, 3, 1])
    expect(sortRows(rows, columns, null)).toBe(rows)
    expect(sortRows(rows, columns, { key: 'nope', dir: 'asc' })).toBe(rows)
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3])
  })

  it('is stable', () => {
    const same = [{ id: 1, v: 'a' }, { id: 2, v: 'a' }, { id: 3, v: 'a' }]
    expect(sortRows(same, [{ key: 'v' }], { key: 'v', dir: 'desc' }).map((r) => r.id)).toEqual([1, 2, 3])
  })
})

describe('dataTableUtils: search, filters, paging', () => {
  it('searches case-insensitively over searchable columns only', () => {
    expect(searchRows(rows, columns, 'ITEM 1').map((r) => r.id)).toEqual([1, 3])
    expect(searchRows(rows, columns, '30')).toEqual([])
    expect(searchRows(rows, columns, 'y').map((r) => r.id)).toEqual([2])
    expect(searchRows(rows, columns, '  ')).toBe(rows)
  })

  it('filters by equality or by a custom matcher, ignoring empty values', () => {
    expect(filterRows(rows, { ref: 'item 2' }).map((r) => r.id)).toEqual([2])
    expect(filterRows(rows, { ref: '' , label: null })).toBe(rows)
    expect(filterRows(rows, { big: 'yes' }, [{ key: 'big', match: (row) => row.amount > 10 }]).map((r) => r.id)).toEqual([1])
  })

  it('pages and clamps', () => {
    expect(pageCount(0, 10)).toBe(1)
    expect(pageCount(21, 10)).toBe(3)
    expect(clampPage(9, 21, 10)).toBe(3)
    expect(clampPage(0, 21, 10)).toBe(1)
    expect(paginateRows(rows, 2, 2).map((r) => r.id)).toEqual([3])
    expect(paginateRows(rows, 5, 2).map((r) => r.id)).toEqual([3])
    expect(pageRange(2, 10, 21)).toEqual({ from: 11, to: 20 })
    expect(pageRange(3, 10, 21)).toEqual({ from: 21, to: 21 })
    expect(pageRange(1, 10, 0)).toEqual({ from: 0, to: 0 })
  })

  it('applies search, filters, sort and paging together', () => {
    const out = applyClientQuery(rows, columns, { sort: { key: 'ref', dir: 'desc' }, q: 'item', filters: {}, page: 1, pageSize: 2 })
    expect(out.total).toBe(3)
    expect(out.rows.map((r) => r.id)).toEqual([1, 2])
  })
})

describe('dataTableUtils: server params', () => {
  it('builds the wire format of listQuery and drops empty values', () => {
    expect(buildListParams({ page: 2, pageSize: 20, sort: { key: 'email', dir: 'desc' }, q: ' a ', filters: { outcome: 'x', empty: '', gone: null } }))
      .toEqual({ page: 2, pageSize: 20, sort: 'email', dir: 'desc', q: 'a', f_outcome: 'x' })
    expect(buildListParams({})).toEqual({ page: 1, pageSize: 20 })
    expect(toQueryString({ page: 1, q: 'a b&c', none: null, blank: '' })).toBe('page=1&q=a+b%26c')
  })
})
