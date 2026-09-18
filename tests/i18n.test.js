import { describe, expect, it } from 'vitest'
import fr from '../src/i18n/fr.json'
import en from '../src/i18n/en.json'
import { translate } from '../src/i18n/index.js'

function flatten(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') flatten(v, key, out)
    else out.push(key)
  }
  return out
}

describe('i18n dictionaries', () => {
  it('fr and en carry the same keys', () => {
    expect(flatten(en).sort()).toEqual(flatten(fr).sort())
  })

  it('keys are English identifiers', () => {
    for (const key of flatten(fr)) expect(key).toMatch(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/)
  })

  it('translates, interpolates and falls back to french then to the key', () => {
    expect(translate('en', 'login.submit')).toBe('Send my link')
    expect(translate('fr', 'home.connectedAs', { name: 'A' })).toContain('A')
    expect(translate('de', 'login.submit')).toBe('Recevoir mon lien')
    expect(translate('fr', 'missing.key')).toBe('missing.key')
  })

  it('every api error code has a translation', () => {
    for (const code of ['auth.required', 'auth.sessionExpired', 'auth.accessRevoked', 'auth.emailRequired', 'auth.tooManyRequests', 'auth.linkSentIfAllowed', 'auth.sendFailed', 'auth.linkInvalid', 'auth.linkUsed', 'auth.linkExpired', 'auth.noLongerAuthorized', 'auth.forbidden', 'common.serverError', 'common.notFound', 'common.tooManyRequests']) {
      expect(translate('fr', code)).not.toBe(code)
      expect(translate('en', code)).not.toBe(code)
    }
  })
})
