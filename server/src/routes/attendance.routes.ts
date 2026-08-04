import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import {
  mySessionAttendanceController,
  sessionAttendanceController,
  unitSummaryController,
  editAttendanceController,
} from '../controllers/attendance.controller'

const router = Router()
const lecturerOrAbove = requireRole('lecturer', 'faculty_admin', 'system_admin')

// Student: my own record for a session
router.get('/sessions/:sessionId/me', authenticate, requireRole('student'), mySessionAttendanceController)

// Lecturer / faculty admin: session records + manual edits
router.get('/sessions/:sessionId', authenticate, lecturerOrAbove, sessionAttendanceController)
router.patch('/sessions/:sessionId', authenticate, lecturerOrAbove, editAttendanceController)

// Lecturer / faculty admin: per-student percentages for a course unit
router.get('/units/:courseUnitId/summary', authenticate, lecturerOrAbove, unitSummaryController)

export default router
