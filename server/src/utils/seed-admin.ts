import 'dotenv/config'
import { prisma } from '../config/db'
import { Role } from '@prisma/client'

/**
 * Pre-registers the first System Admin account by email so they can sign in
 * via Google OAuth. No password is ever set — authentication is Google-only.
 *
 * Usage: npm run seed:admin
 * Requires SEED_ADMIN_EMAIL in .env (and optionally SEED_ADMIN_NAME).
 */
async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL
  const name = process.env.SEED_ADMIN_NAME || 'System Administrator'

  if (!email) {
    console.error('SEED_ADMIN_EMAIL is not set in .env — cannot seed admin.')
    process.exit(1)
  }

  const existing = await prisma.user.findUnique({ where: { email } })

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: {
        role: Role.system_admin,
        profileComplete: true,
        isActive: true,
      },
    })
    console.log(`System admin updated: ${email}`)
  } else {
    await prisma.user.create({
      data: {
        email,
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
