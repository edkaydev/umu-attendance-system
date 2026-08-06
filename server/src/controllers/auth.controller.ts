import { Request, Response, NextFunction } from 'express'
import passport from 'passport'
import crypto from 'crypto'
import { z } from 'zod'
import { Role } from '@prisma/client'
import { ok } from '../utils/apiResponse'
import {
  finalizeLogin,
  refreshSession,
  logoutSession,
  getCurrentUser,
  loginWithPassword,
  changePassword,
  mapOAuthError,
} from '../services/auth.service'
import { authCookieNames } from '../services/jwt.service'
import { prisma } from '../config/db'

const OAUTH_SCOPES = ['profile', 'email']

const loginSchema = z.object({
  email: z.string().email('Invalid email').max(150),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(128),
  newPassword: z.string().min(6, 'Password must be at least 6 characters').max(128),
})

/** POST /api/auth/login — sign in with email + password. */
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = loginSchema.parse(req.body)
    const user = await loginWithPassword(email, password)
    const redirect = await finalizeLogin(user, res)
    ok(res, { user: await getCurrentUser(user.id), redirect })
  } catch (error) {
    next(error)
  }
}

/** POST /api/auth/password — change the current password (forced or voluntary). */
export async function postPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body)
    await changePassword(req.user!.id, currentPassword, newPassword)
    // The change invalidates every refresh token, including this browser's.
    // Issue a replacement session so the user remains signed in.
    await finalizeLogin(req.user!, res)
    ok(res, { message: 'Password changed successfully' })
  } catch (error) {
    next(error)
  }
}

/** GET /api/auth/google — start the OAuth flow (redirect to Google). */
export function googleRedirect(req: Request, res: Response, next: NextFunction): void {
  passport.authenticate('google', { scope: OAUTH_SCOPES })(req, res, next)
}

/** GET /api/auth/google/callback — exchange code, set cookies, redirect. */
export function googleCallback(req: Request, res: Response, next: NextFunction): void {
  passport.authenticate('google', { session: false }, (err: Error | null, user: Express.User | undefined) => {
    if (err || !user) {
      const reason = err instanceof Error ? mapOAuthError(err.message) : 'error'
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
      res.redirect(`${clientUrl}/access-denied?reason=${reason}`)
      return
    }

    finalizeLogin(
      user as {
        id: string
        email: string
        role: Role
        profileComplete: boolean
        mustChangePassword: boolean
      },
      res
    )
      .then((redirectUrl) => res.redirect(redirectUrl))
      .catch(next)
  })(req, res, next)
}

/** POST /api/auth/refresh — silently rotate the access token. */
export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawRefreshToken = req.cookies?.[authCookieNames.refresh]
    if (!rawRefreshToken) {
      res.status(401).json({ error: 'Missing refresh token' })
      return
    }
    await refreshSession(rawRefreshToken, res)
    ok(res, { message: 'Session refreshed' })
  } catch (error) {
    next(error)
  }
}

/** POST /api/auth/logout — clear cookies and revoke refresh tokens. */
export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.id
    if (userId) {
      await logoutSession(userId, res)
    } else {
      res.clearCookie(authCookieNames.access)
      res.clearCookie(authCookieNames.refresh)
    }
    ok(res, { message: 'Logged out' })
  } catch (error) {
    next(error)
  }
}

/** GET /api/auth/me — current user profile. */
export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await getCurrentUser(req.user!.id)
    ok(res, { user })
  } catch (error) {
    next(error)
  }
}

const DEV_ROLES = Object.values(Role)

/**
 * POST /api/auth/dev-login — development-only instant login.
 * Disabled in production. Finds or creates a user for the requested role.
 */
export async function devLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (process.env.NODE_ENV === 'production') {
      res.status(404).json({ error: 'Route not found' })
      return
    }

    const requestedRole = (req.body?.role ?? 'system_admin') as Role
    const role = DEV_ROLES.includes(requestedRole) ? requestedRole : Role.system_admin
    const email = (req.body?.email as string | undefined) ?? `dev.${role}@umu.ac.ug`

    let user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      const needsProfile = role === 'student' || role === 'lecturer'
      user = await prisma.user.create({
        data: {
          googleId: `dev-${role}-${crypto.randomUUID()}`,
          email,
          fullName: `Dev ${role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`,
          role,
          profileComplete: !needsProfile,
          isActive: true,
        },
      })
    }

    if (role !== user.role) {
      user = await prisma.user.update({ where: { id: user.id }, data: { role } })
    }

    const needsProfile = user.role === 'student' || user.role === 'lecturer'
    if (!needsProfile && !user.profileComplete) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { profileComplete: true },
      })
    }

    const redirect = await finalizeLogin(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        profileComplete: user.profileComplete,
        mustChangePassword: user.mustChangePassword,
      },
      res
    )
    ok(res, { user: await getCurrentUser(user.id), redirect })
  } catch (error) {
    next(error)
  }
}
