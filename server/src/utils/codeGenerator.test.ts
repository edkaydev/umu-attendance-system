import { describe, it, expect } from 'vitest'
import { generateSessionCode, generateUniqueSessionCode } from './codeGenerator'

const FORBIDDEN = /[O0I1B8S5]/

describe('generateSessionCode', () => {
  it('produces a 6-character code', () => {
    const code = generateSessionCode()
    expect(code).toHaveLength(6)
  })

  it('only uses characters from the safe pool (no O/0/I/1/B/8/S/5)', () => {
    for (let i = 0; i < 500; i++) {
      expect(generateSessionCode()).not.toMatch(FORBIDDEN)
    }
  })

  it('is uppercase alphanumeric', () => {
    expect(generateSessionCode()).toMatch(/^[A-Z2-9]{6}$/)
  })

  it('produces varied codes', () => {
    const set = new Set(Array.from({ length: 200 }, () => generateSessionCode()))
    expect(set.size).toBeGreaterThan(150)
  })
})

describe('generateUniqueSessionCode', () => {
  it('returns a code that passes the uniqueness check', async () => {
    const taken = new Set<string>(['ABC234'])
    const code = await generateUniqueSessionCode(async (c) => taken.has(c))
    expect(taken.has(code)).toBe(false)
    expect(code).toHaveLength(6)
  })

  it('avoids taken codes and returns a distinct one', async () => {
    const taken = new Set<string>()
    const first = await generateUniqueSessionCode(async (c) => {
      if (taken.has(c)) return true
      taken.add(c)
      return false
    })
    const second = await generateUniqueSessionCode(async (c) => taken.has(c))
    expect(second).not.toBe(first)
  })
})
