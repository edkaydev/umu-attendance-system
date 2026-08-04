import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import {
  googleRedirect,
  googleCallback,
  refresh,
  logout,
  me,
} from '../controllers/auth.controller'

const router = Router()

router.get('/google', googleRedirect)
router.get('/google/callback', googleCallback)
router.post('/refresh', refresh)
router.post('/logout', authenticate, logout)
router.get('/me', authenticate, me)

export default router
