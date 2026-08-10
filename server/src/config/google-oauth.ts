import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { prisma } from './db'
import { Role } from '@prisma/client'

/**
 * Bootstrap check: if ADMIN_BOOTSTRAP_EMAIL is set in .env and the logging-in
 * email matches it, AND no system_admin account exists yet, auto-create one.
 */
async function maybeBootstrapAdmin(
  email: string,
  googleId: string,
  fullName: string,
  photoUrl: string | null
) {
  const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase()
  if (!bootstrapEmail || email.toLowerCase() !== bootstrapEmail) return null

  const existingAdmin = await prisma.user.findFirst({
    where: { role: Role.system_admin },
  })
  if (existingAdmin) return null

  // First-ever System Admin — create automatically
  return prisma.user.create({
    data: {
      googleId,
      email,
      fullName,
      role: Role.system_admin,
      profileComplete: true,
      isActive: true,
      photoUrl,
    },
  })
}

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase()
        if (!email) {
          return done(new Error('No email returned from Google'), undefined)
        }

        const isStudent = email.endsWith('@stud.umu.ac.ug')
        const isStaff   = email.endsWith('@umu.ac.ug')

        if (!isStudent && !isStaff) {
          return done(new Error('INVALID_DOMAIN'), undefined)
        }

        const fullName = profile.displayName ?? email
        const photoUrl = profile.photos?.[0]?.value ?? null

        // ── Bootstrap System Admin ──────────────────────────────────────────
        if (isStaff) {
          const bootstrapped = await maybeBootstrapAdmin(
            email, profile.id, fullName, photoUrl
          )
          if (bootstrapped) return done(null, bootstrapped)
        }

        // ── Look up existing account ────────────────────────────────────────
        // Primary lookup: googleId (fast, accounts already linked)
        let user = await prisma.user.findUnique({ where: { googleId: profile.id } })

        if (!user) {
          // Secondary lookup: email (handles pre-registered staff accounts
          // that haven't logged in via Google yet)
          const byEmail = await prisma.user.findUnique({ where: { email } })

          if (byEmail) {
            // Link the Google ID to the existing pre-registered account
            user = await prisma.user.update({
              where: { email },
              data: { googleId: profile.id, photoUrl, fullName },
            })
          } else if (isStaff) {
            // Staff must be pre-registered by a System Admin — reject unknown emails
            return done(new Error('NOT_REGISTERED'), undefined)
          } else {
            // Students are auto-created on first Google login
            user = await prisma.user.create({
              data: {
                googleId: profile.id,
                email,
                fullName,
                role: Role.student,
                profileComplete: false,
                isActive: true,
                photoUrl,
              },
            })
          }
        } else {
          // Refresh photo and name on every login (user may have updated Google profile)
          user = await prisma.user.update({
            where: { id: user.id },
            data: { photoUrl, fullName },
          })
        }

        if (!user.isActive) {
          return done(new Error('ACCOUNT_DISABLED'), undefined)
        }

        return done(null, user)
      } catch (error) {
        return done(error as Error, undefined)
      }
    }
  )
)

export default passport
