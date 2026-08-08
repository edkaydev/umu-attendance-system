import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import { rateLimiter } from '../middleware/rateLimiter'
import { checkInController, listLiveController } from '../controllers/checkin.controller'

const router = Router()
const studentOnly = requireRole('student')

/**
 * Allow at most 10 check-in attempts per student per 5-minute window.
 * The code space is large enough (28^6 ≈ 481 M) that brute-force is
 * impractical even without rate limiting, but this adds a safety net
 * against scripted abuse and provides a clear 429 error to the UI.
 */
const checkInRateLimit = rateLimiter(5 * 60_000, 10)

router.get('/live', authenticate, studentOnly, listLiveController)
router.post('/', authenticate, studentOnly, checkInRateLimit, checkInController)

export default router
