import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { prisma } from './db'
import { Role } from '@prisma/client'

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value

        if (!email) {
          return done(new Error('No email returned from Google'), undefined)
        }

        // Enforce domain restriction
        const isStudent = email.endsWith('@stud.umu.ac.ug')
        const isStaff = email.endsWith('@umu.ac.ug')

        if (!isStudent && !isStaff) {
          return done(new Error('INVALID_DOMAIN'), undefined)
        }

        // Find or create user
        let user = await prisma.user.findUnique({
          where: { googleId: profile.id },
        })

        if (!user) {
          // Check if staff email was pre-registered by System Admin
          if (isStaff) {
            const existing = await prisma.user.findUnique({
              where: { email },
            })
            if (existing) {
              // Link Google ID to pre-registered staff account
              user = await prisma.user.update({
                where: { email },
                data: { googleId: profile.id },
              })
            } else {
              return done(new Error('NOT_REGISTERED'), undefined)
            }
          } else {
            // Students are created on first login
            user = await prisma.user.create({
              data: {
                googleId: profile.id,
                email,
                fullName: profile.displayName,
                role: Role.student,
                profileComplete: false,
                isActive: true,
              },
            })
          }
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
