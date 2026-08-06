import 'dotenv/config'
import { prisma } from '../config/db'
import { Role } from '@prisma/client'
import { hashPassword } from './password'

/**
 * Creates (or promotes) the first System Admin account.
 * The account can sign in with either:
 *   - email + password (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD), or
 *   - Google (the OAuth strategy matches pre-registered staff by email).
 *
 * Usage: npm run seed:admin
 * Requires SEED_ADMIN_EMAIL (and optionally SEED_ADMIN_NAME, SEED_ADMIN_PASSWORD) in .env
 */
async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL
  const name = process.env.SEED_ADMIN_NAME || 'System Administrator'
  const plainPassword = process.env.SEED_ADMIN_PASSWORD

  if (!email) {
    console.error('SEED_ADMIN_EMAIL is not set in .env — cannot seed admin.')
    process.exit(1)
  }

  const password = plainPassword ? await hashPassword(plainPassword) : undefined

  const existing = await prisma.user.findUnique({ where: { email } })

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: {
        role: Role.system_admin,
        profileComplete: true,
        isActive: true,
        ...(password ? { password } : {}),
      },
    })
    console.log(`System admin updated: ${email}`)
  } else {
    await prisma.user.create({
      data: {
        googleId: `seed:${email}`,
        email,
        password,
        fullName: name,
        role: Role.system_admin,
        profileComplete: true,
        isActive: true,
      },
    })
    console.log(`System admin created: ${email}`)
  }
}

main()
  .catch((error) => {
    console.error('Seed failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
