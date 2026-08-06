import 'dotenv/config'
import { prisma } from '../config/db'
import { getDefaultUserPasswordHash } from '../services/settings.service'

/**
 * Backfill local passwords for accounts imported before the default-password
 * policy. Existing local passwords are deliberately never overwritten.
 *
 * Usage: npm run passwords:apply-default
 */
async function main(): Promise<void> {
  const password = await getDefaultUserPasswordHash()
  const result = await prisma.user.updateMany({
    where: { password: null },
    data: { password, mustChangePassword: true },
  })

  console.log(`Applied the default password to ${result.count} account(s) without a local password.`)
}

main()
  .catch((error) => {
    console.error('Default-password backfill failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
