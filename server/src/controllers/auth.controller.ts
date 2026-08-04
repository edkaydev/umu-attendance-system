import { Request, Response, NextFunction } from 'express'
import passport from 'passport'
import { ok } from '../utils/apiResponse'
import {
  finalizeLogin,
  refreshSession,
  logoutSession,
  getCurrentUser,
  mapOAuthError,
} from '../services/auth.service'
import { authCookieNames } from '../services/jwt.service'

const OAUTH_SCOPES = ['profile', 'email']

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

    finalizeLogin(user as Express.User, res)
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
