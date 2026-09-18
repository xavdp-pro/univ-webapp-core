import { describe, expect, it } from 'vitest'
import {
  isHideable,
  loadHidden,
  normaliseHidden,
  saveHidden,
  storageKey,
  toggleHidden,
  visibleColumns,
} from '../src/components/ui/columnVisibility.js'

const columns = [
  { key: 'email', hideable: false },
  { key: 'name' },
  { key: 'role' },
]

function memoryStorage(initial = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v) },
    removeItem: (k) => { delete data[k] },
  }
}

describe('columnVisibility', () => {
  it('a column is hideable unless it says otherwise', () => {
    expect(isHideable({ key: 'a' })).toBe(true)
    expect(isHideable({ key: 'a', hideable: false })).toBe(false)
  })

  it('normalises a saved list against the columns', () => {
    expect(normaliseHidden(['role', 'email', 'nope', 'role'], columns)).toEqual(['role'])
    expect(normaliseHidden('garbage', columns)).toEqual([])
  })

  it('never hides a non-hideable column', () => {
    expect(visibleColumns(columns, ['email', 'name']).map((c) => c.key)).toEqual(['email', 'role'])
    expect(toggleHidden([], 'email', columns)).toEqual([])
    expect(toggleHidden([], 'name', columns)).toEqual(['name'])
    expect(toggleHidden(['name'], 'name', columns)).toEqual([])
    expect(toggleHidden([], 'unknown', columns)).toEqual([])
  })

  it('round-trips through storage and removes the entry when nothing is hidden', () => {
    const storage = memoryStorage()
    saveHidden('users', ['role'], storage)
    expect(storage.data[storageKey('users')]).toBe('["role"]')
    expect(loadHidden('users', columns, storage)).toEqual(['role'])
    saveHidden('users', [], storage)
    expect(storage.data[storageKey('users')]).toBeUndefined()
  })

  it('works without storage or with a broken one', () => {
    expect(loadHidden('users', columns, null)).toEqual([])
    expect(loadHidden(undefined, columns, memoryStorage())).toEqual([])
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(loadHidden('users', columns, broken)).toEqual([])
    expect(() => saveHidden('users', ['role'], broken)).not.toThrow()
    expect(loadHidden('users', columns, memoryStorage({ [storageKey('users')]: '{not json' }))).toEqual([])
  })
})
