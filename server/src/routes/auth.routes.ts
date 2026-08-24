import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { rateLimiter } from '../middleware/rateLimiter'
import {
  login,
  googleRedirect,
  googleCallback,
  refresh,
  logout,
  me,
  postPassword,
  devLogin,
} from '../controllers/auth.controller'

const router = Router()

// Login attempts are keyed per IP+email so a classroom logging in behind one
// NAT address cannot lock each other out. Ban escalation disabled — failed
// logins are already slowed by bcrypt and audited.
const loginLimiter = rateLimiter(
  15 * 60_000,
  30,
  (req) => `${req.ip ?? 'anonymous'}:${String(req.body?.email ?? '').toLowerCase()}`,
  { enableBan: false }
)
// Refresh is called silently by the client on every cold load.
const refreshLimiter = rateLimiter(15 * 60_000, 120, (req) => req.ip ?? 'anonymous', {
  enableBan: false,
})

router.post('/login',          loginLimiter, login)
router.get('/google',          googleRedirect)
router.get('/google/callback', googleCallback)
router.post('/refresh',        refreshLimiter, refresh)
router.post('/logout',         authenticate, logout)
router.get('/me',              authenticate, me)
router.post('/password',       authenticate, postPassword)

// Dev-only bypass — never registered in production
if (process.env.NODE_ENV !== 'production') {
  router.post('/dev-login', devLogin)
}

export default router
