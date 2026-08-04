import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import { completeProfile, updateProfile } from '../controllers/profile.controller'

const router = Router()
const studentOrLecturer = requireRole('student', 'lecturer')

router.put('/complete', authenticate, studentOrLecturer, completeProfile)
router.put('/', authenticate, studentOrLecturer, updateProfile)

export default router
