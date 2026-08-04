import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import {
  openSessionController,
  listSessionsController,
  getSessionController,
  getLiveSessionController,
  closeSessionController,
  reopenSessionController,
} from '../controllers/session.controller'

const router = Router()
const lecturerOnly = requireRole('lecturer')
const facultyAdmin = requireRole('faculty_admin')

// Lecturer manages own sessions; Faculty Admin can view faculty sessions
router.post('/', authenticate, lecturerOnly, openSessionController)
router.get('/', authenticate, lecturerOnly, listSessionsController)
router.get('/:sessionId', authenticate, getSessionController)
router.get('/:sessionId/live', authenticate, lecturerOnly, getLiveSessionController)
router.patch('/:sessionId/close', authenticate, lecturerOnly, closeSessionController)
router.patch('/:sessionId/reopen', authenticate, lecturerOnly, reopenSessionController)

export default router
