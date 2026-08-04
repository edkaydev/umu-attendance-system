import { Request, Response, NextFunction } from 'express'
import { Role } from '@prisma/client'

/**
 * Role-based access control guard.
 * Use after authenticate() middleware.
 *
 * Example:
 *   router.get('/reports', authenticate, requireRole('faculty_admin'), handler)
 *   router.post('/sessions', authenticate, requireRole('lecturer', 'faculty_admin'), handler)
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Forbidden',
        message: `This action requires one of: ${roles.join(', ')}`,
      })
      return
    }

    next()
  }
}

/**
 * Ensures the user has completed their profile.
 * Redirects incomplete profiles to the setup page.
 * Use after authenticate() on routes that require a complete profile.
 */
export function requireCompleteProfile(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }

  // System admins don't need a profile setup step
  if (req.user.role === 'system_admin') {
    next()
    return
  }

  if (!req.user.profileComplete) {
    res.status(403).json({
      error: 'Profile incomplete',
      code: 'PROFILE_INCOMPLETE',
      message: 'Please complete your profile before accessing this resource',
    })
    return
  }

  next()
}
