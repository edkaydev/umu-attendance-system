import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import { completeProfile, updateProfile, completeTour } from '../controllers/profile.controller'

const router = Router()
const studentOrLecturer = requireRole('student', 'lecturer')

router.put('/complete', authenticate, studentOrLecturer, completeProfile)
router.put('/', authenticate, studentOrLecturer, updateProfile)
// Tour completion applies to every role — no role restriction.
router.put('/tour-complete', authenticate, completeTour)

export default router
