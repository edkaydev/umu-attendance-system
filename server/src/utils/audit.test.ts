import { beforeEach, describe, expect, it, vi } from 'vitest'

const { create } = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock('../config/db', () => ({
  prisma: { auditLog: { create } },
}))

import { writeAuditLog } from './audit'

describe('writeAuditLog', () => {
  beforeEach(() => {
    create.mockReset()
    create.mockResolvedValue({})
  })

  it('writes the action against the acting user and target', async () => {
    await writeAuditLog('user-1', 'SESSION_OPEN', 'session', 'sess-1')

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        action: 'SESSION_OPEN',
        targetType: 'session',
        targetId: 'sess-1',
        meta: undefined,
      },
    })
  })

  it('passes meta through when supplied', async () => {
    await writeAuditLog('user-1', 'ATTENDANCE_EDIT', 'attendance', 'att-1', {
      from: 'absent',
      to: 'present',
    })

    expect(create.mock.calls[0][0].data.meta).toEqual({ from: 'absent', to: 'present' })
  })

  it('propagates database failures to the caller', async () => {
    create.mockRejectedValue(new Error('db down'))
    await expect(writeAuditLog('user-1', 'LOGIN', 'user', 'user-1')).rejects.toThrow('db down')
  })
})
