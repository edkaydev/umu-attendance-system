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

// 10 login attempts per 15 minutes per IP
const loginLimiter = rateLimiter(15 * 60_000, 10, (req) => req.ip ?? 'anonymous')
// 20 refresh attempts per 15 minutes per IP (silent background calls)
const refreshLimiter = rateLimiter(15 * 60_000, 20, (req) => req.ip ?? 'anonymous')

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
