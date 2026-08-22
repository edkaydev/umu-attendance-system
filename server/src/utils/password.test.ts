import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password'

describe('hashPassword', () => {
  it('produces a bcrypt hash that is not the plaintext', async () => {
    const hash = await hashPassword('Nkozi#2024')
    expect(hash).not.toBe('Nkozi#2024')
    expect(hash).toMatch(/^\$2[aby]\$10\$/)
  })

  it('salts each hash, so the same password hashes differently', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')])
    expect(a).not.toBe(b)
  })
})

describe('verifyPassword', () => {
  it('accepts the correct password', async () => {
    const hash = await hashPassword('Nkozi#2024')
    await expect(verifyPassword('Nkozi#2024', hash)).resolves.toBe(true)
  })

  it('rejects a wrong password and is case sensitive', async () => {
    const hash = await hashPassword('Nkozi#2024')
    await expect(verifyPassword('nkozi#2024', hash)).resolves.toBe(false)
    await expect(verifyPassword('', hash)).resolves.toBe(false)
  })
})
