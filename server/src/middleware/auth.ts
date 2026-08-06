import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../config/db'
import { Role } from '@prisma/client'

// Extend Express Request user (merged with passport's Express.User)
declare global {
  namespace Express {
    interface User {
      id: string
      email: string
      role: Role
      profileComplete: boolean
      mustChangePassword: boolean
      facultyId: string | null
    }
  }
}

interface JwtPayload {
  sub: string   // user id
  email: string
  role: Role
}

/** Paths a user can still reach while their password change is pending. */
const PASSWORD_CHANGE_EXEMPT = ['/api/auth/me', '/api/auth/logout', '/api/auth/password']

/**
 * Verifies the JWT access token from the HttpOnly cookie.
 * Attaches user info to req.user on success.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = req.cookies?.access_token

    if (!token) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }

    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as JwtPayload

    // Fetch fresh user state (catches deactivated accounts mid-session)
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        profileComplete: true,
        isActive: true,
        mustChangePassword: true,
        facultyId: true,
      },
    })

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Account not found or disabled' })
      return
    }

    // Force a password change before the account can do anything else.
    if (user.mustChangePassword && !PASSWORD_CHANGE_EXEMPT.includes(req.originalUrl)) {
      res.status(403).json({
        error: 'You must change your password before continuing',
        code: 'PASSWORD_CHANGE_REQUIRED',
      })
      return
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      profileComplete: user.profileComplete,
      mustChangePassword: user.mustChangePassword,
      facultyId: user.facultyId,
    }

    next()
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' })
      return
    }
    res.status(401).json({ error: 'Invalid token' })
  }
}
