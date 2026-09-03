/**
 * Google OAuth 2.0 strategy for Passport.js.
 *
 * Architecture
 * ------------
 * Google is an AUTHENTICATION provider only.
 * Moodle is the ACADEMIC IDENTITY authority.
 *
 * Login flow:
 *   1. Google authenticates the user and returns a verified email + googleId.
 *   2. We resolve the Attendance account:
 *      a. Exact match on googleId (already linked — fast path).
 *      b. Email match on an account that has moodleUserId set (one-time link).
 *      c. Email match on a staff account with no moodleUserId (legacy staff path).
 *      d. No match → reject with NOT_SYNCHRONIZED.
 *   3. A student account is NEVER created here from a Google login alone.
 *      Student accounts must be created by the Moodle sync.
 *
 * OAuth state parameter (CSRF protection)
 * ----------------------------------------
 * The auth controller generates a cryptographically random state token,
 * stores it in a short-lived HttpOnly cookie, and passes it to Google.
 * On callback, the strategy verifies the state via passReqToCallback.
 * This prevents CSRF attacks on the OAuth callback endpoint.
 *
 * The strategy uses `passReqToCallback: true` so it can read the
 * oauth_state cookie for validation.
 */

import passport from 'passport'
import crypto from 'crypto'
import type express from 'express'
import { Strategy as GoogleStrategy, type GoogleCallbackParameters, type Profile as GoogleProfile } from 'passport-google-oauth20'
import type { VerifyCallback } from 'passport-oauth2'
import { prisma } from './db'

const STUDENT_DOMAIN = '@stud.umu.ac.ug'
const STAFF_DOMAIN = '@umu.ac.ug'

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
      // passReqToCallback enables state validation inside the strategy
      passReqToCallback: true,
    },
    async (
      req: express.Request,
      _accessToken: string,
      _refreshToken: string,
      params: GoogleCallbackParameters,
      profile: GoogleProfile,
      done: VerifyCallback
    ) => {
      try {
        // ── 1. State validation (CSRF protection) ─────────────────────────
        // The state is set by googleRedirect and validated here.
        // `params` from passport-google-oauth20 includes the `state` field.
        const returnedState = (params as unknown as { state?: string }).state
        const cookieState = req.cookies?.['oauth_state']

        if (!cookieState || !returnedState) {
          return done(new Error('OAUTH_STATE_MISSING'), undefined)
        }

        // Timing-safe comparison
        let stateValid = false
        try {
          const a = Buffer.from(cookieState)
          const b = Buffer.from(returnedState)
          stateValid = a.length === b.length && crypto.timingSafeEqual(a, b)
        } catch {
          stateValid = false
        }

        if (!stateValid) {
          return done(new Error('OAUTH_STATE_MISMATCH'), undefined)
        }

        // ── 2. Extract email ───────────────────────────────────────────────
        const email = profile.emails?.[0]?.value?.toLowerCase().trim()

        if (!email) {
          return done(new Error('NO_EMAIL'), undefined)
        }

        const isStudent = email.endsWith(STUDENT_DOMAIN)
        const isStaff = email.endsWith(STAFF_DOMAIN) && !isStudent

        if (!isStudent && !isStaff) {
          return done(new Error('INVALID_DOMAIN'), undefined)
        }

        // ── 3a. Exact googleId match (already linked) ─────────────────────
        let user = await prisma.user.findUnique({ where: { googleId: profile.id } })

        if (user) {
          if (!user.isActive) return done(new Error('ACCOUNT_DISABLED'), undefined)
          return done(null, user)
        }

        // ── 3b/c. Email match ─────────────────────────────────────────────
        const existing = await prisma.user.findUnique({ where: { email } })

        if (existing) {
          // Guard: never touch admin accounts that aren't linked to Moodle
          // and came in on a student domain — shouldn't happen but safe-guard.
          if (!existing.isActive) {
            return done(new Error('ACCOUNT_DISABLED'), undefined)
          }

          // For students: the account must be Moodle-linked (moodleUserId set).
          // This prevents a bare Google account from activating an unsynced student.
          if (isStudent && existing.moodleUserId === null) {
            return done(new Error('NOT_SYNCHRONIZED'), undefined)
          }

          // For staff (lecturers, faculty admins):
          // Accept both Moodle-linked accounts and pre-existing staff accounts
          // created by CSV import (they may not have moodleUserId yet).
          // Link the Google ID as a one-time operation.
          user = await prisma.user.update({
            where: { email },
            data: { googleId: profile.id },
          })

          return done(null, user)
        }

        // ── 3d. No match ──────────────────────────────────────────────────
        // Students: must be created by the Moodle sync first. Reject.
        if (isStudent) {
          return done(new Error('NOT_SYNCHRONIZED'), undefined)
        }

        // Staff: no pre-existing account → not registered in Attendance yet.
        return done(new Error('NOT_REGISTERED'), undefined)

      } catch (error) {
        return done(error as Error, undefined)
      }
    }
  )
)

export default passport
