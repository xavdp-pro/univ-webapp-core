import { describe, expect, it } from 'vitest'
import {
  compose,
  email,
  hasErrors,
  maxLength,
  minLength,
  oneOf,
  pattern,
  pickFieldErrors,
  required,
  validateValues,
} from '../src/components/ui/formValidators.js'

describe('formValidators: rules', () => {
  it('required fails on blank values only', () => {
    const rule = required()
    expect(rule('')).toBe('form.required')
    expect(rule('   ')).toBe('form.required')
    expect(rule(null)).toBe('form.required')
    expect(rule(undefined)).toBe('form.required')
    expect(rule([])).toBe('form.required')
    expect(rule('x')).toBeUndefined()
    expect(rule(0)).toBeUndefined()
    expect(rule(false)).toBeUndefined()
    expect(required('form.required', { checked: true })(false)).toBe('form.required')
    expect(required('form.required', { checked: true })(true)).toBeUndefined()
    expect(required('custom.key')('')).toBe('custom.key')
  })

  it('email checks the loose shape and lets blanks through', () => {
    const rule = email()
    expect(rule('a@b.co')).toBeUndefined()
    expect(rule(' a@b.co ')).toBeUndefined()
    expect(rule('')).toBeUndefined()
    expect(rule('nope')).toBe('form.email')
    expect(rule('a@b')).toBe('form.email')
    expect(rule('a b@c.d')).toBe('form.email')
  })

  it('length rules carry their bound as a variable', () => {
    expect(minLength(2)('a')).toEqual({ key: 'form.minLength', vars: { n: 2 } })
    expect(minLength(2)('ab')).toBeUndefined()
    expect(minLength(2)('')).toBeUndefined()
    expect(maxLength(3)('abcd')).toEqual({ key: 'form.maxLength', vars: { n: 3 } })
    expect(maxLength(3)('abc')).toBeUndefined()
  })

  it('oneOf and pattern', () => {
    expect(oneOf(['admin', 'member'])('admin')).toBeUndefined()
    expect(oneOf(['admin', 'member'])('root')).toBe('form.invalidChoice')
    expect(oneOf(['admin'])('')).toBeUndefined()
    expect(pattern(/^\d+$/)('123')).toBeUndefined()
    expect(pattern(/^\d+$/)('12a')).toBe('form.pattern')
  })

  it('compose returns the first failing rule, accepting nested arrays', () => {
    const rule = compose(required(), [email(), maxLength(5)])
    expect(rule('')).toBe('form.required')
    expect(rule('nope')).toBe('form.email')
    expect(rule('a@b.cd')).toEqual({ key: 'form.maxLength', vars: { n: 5 } })
    expect(rule('a@b.c')).toBeUndefined()
  })
})

describe('formValidators: forms', () => {
  it('validates every field of the rule map', () => {
    const rules = { email: [required(), email()], name: minLength(2), role: oneOf(['admin', 'member']) }
    expect(validateValues({ email: 'a@b.co', name: 'ok', role: 'member' }, rules)).toEqual({})
    expect(validateValues({ email: '', name: 'x', role: 'root' }, rules)).toEqual({
      email: 'form.required',
      name: { key: 'form.minLength', vars: { n: 2 } },
      role: 'form.invalidChoice',
    })
    expect(hasErrors({})).toBe(false)
    expect(hasErrors({ a: 'x' })).toBe(true)
  })

  it('keeps only server field errors that name a known field', () => {
    const fields = { email: 'users.emailTaken', role: { key: 'form.invalidChoice' }, evil: 'x', name: 42 }
    expect(pickFieldErrors(fields, ['email', 'role', 'name'])).toEqual({ email: 'users.emailTaken', role: { key: 'form.invalidChoice' } })
    expect(pickFieldErrors(null, ['email'])).toEqual({})
    expect(pickFieldErrors('nope', ['email'])).toEqual({})
  })
})
