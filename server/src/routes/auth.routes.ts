import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { rateLimiter } from '../middleware/rateLimiter'
import {
  googleRedirect,
  googleCallback,
  refresh,
  logout,
  me,
  devLogin,
} from '../controllers/auth.controller'

const router = Router()

// Refresh is called silently by the client on every cold load.
const refreshLimiter = rateLimiter(15 * 60_000, 120, (req) => req.ip ?? 'anonymous', {
  enableBan: false,
})

router.get('/google',          googleRedirect)
router.get('/google/callback', googleCallback)
router.post('/refresh',        refreshLimiter, refresh)
router.post('/logout',         authenticate, logout)
router.get('/me',              authenticate, me)

// Dev-only bypass — never registered in production
if (process.env.NODE_ENV !== 'production') {
  router.post('/dev-login', devLogin)
}

export default router
