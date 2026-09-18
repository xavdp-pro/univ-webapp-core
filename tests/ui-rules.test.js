/**
 * The four UI rules of 16 September 2026, enforced on every file under src/:
 *  1. pure ajax: a <form> is tolerated only when its submit is intercepted
 *     (onSubmit + preventDefault) and it carries no method/action;
 *  2. never alert(), confirm() or prompt(): a modal instead;
 *  3. never a raw native <select>: the styled Select component;
 *  4. long lists get a searchable picker with a clear cross: Select does it
 *     automatically above SEARCH_THRESHOLD, and this test pins that behaviour.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(jsx?|tsx?)$/.test(name)) out.push(full)
  }
  return out
}

const files = walk(SRC).map((file) => ({ file: path.relative(SRC, file), text: readFileSync(file, 'utf8') }))

describe('UI rules', () => {
  it('scans a non-empty src/', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('rule 1: no native form submission', () => {
    const offenders = []
    for (const { file, text } of files) {
      const forms = text.match(/<form\b[^>]*>/g) || []
      for (const tag of forms) {
        if (/\b(method|action)=/.test(tag)) offenders.push(`${file}: <form> with method/action`)
        if (!/\bonSubmit=/.test(tag)) offenders.push(`${file}: <form> without onSubmit`)
        else if (!/preventDefault\(\)/.test(text)) offenders.push(`${file}: <form> whose submit is not intercepted`)
      }
      if (/<input\b[^>]*type=["']submit["']/.test(text) && !/preventDefault\(\)/.test(text)) offenders.push(`${file}: submit input without preventDefault`)
    }
    expect(offenders).toEqual([])
  })

  it('rule 2: no alert, confirm or prompt', () => {
    const re = /(^|[^.\w$])(window\.)?(alert|confirm|prompt)\s*\(/m
    const offenders = files.filter(({ text }) => re.test(text)).map(({ file }) => file)
    expect(offenders).toEqual([])
  })

  it('rule 3: no native <select>', () => {
    const offenders = files.filter(({ text }) => /<select\b/.test(text)).map(({ file }) => file)
    expect(offenders).toEqual([])
  })

  it('rule 4: the Select primitive searches long lists and offers a clear cross', () => {
    const select = files.find(({ file }) => file === path.join('components', 'ui', 'Select.jsx'))
    expect(select, 'src/components/ui/Select.jsx must exist').toBeTruthy()
    const threshold = select.text.match(/SEARCH_THRESHOLD\s*=\s*(\d+)/)
    expect(threshold, 'SEARCH_THRESHOLD constant').toBeTruthy()
    expect(Number(threshold[1])).toBeLessThanOrEqual(10)
    expect(select.text).toMatch(/options\.length\s*>\s*SEARCH_THRESHOLD/)
    expect(select.text).toMatch(/<input[\s\S]*placeholder=\{t\('common\.search'\)\}/)
    expect(select.text).toMatch(/aria-label=\{t\('common\.clear'\)\}/)
    expect(select.text).toMatch(/<X\b/)
  })
})
