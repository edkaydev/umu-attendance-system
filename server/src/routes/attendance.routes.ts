import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import {
  myAttendanceController,
  sessionAttendanceController,
  unitSummaryController,
  editAttendanceController,
} from '../controllers/attendance.controller'

const router = Router()
const staffOrAbove = requireRole('lecturer', 'faculty_admin', 'system_admin')

// Student: own attendance per unit (current semester)
router.get('/my', authenticate, requireRole('student'), myAttendanceController)

// Lecturer / faculty admin: session list + unit summary + manual edits
router.get('/session/:sessionId', authenticate, staffOrAbove, sessionAttendanceController)
router.get('/unit/:courseUnitId', authenticate, staffOrAbove, unitSummaryController)
router.patch('/:recordId', authenticate, staffOrAbove, editAttendanceController)

export default router
