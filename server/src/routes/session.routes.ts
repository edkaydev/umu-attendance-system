import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import {
  openSessionController,
  listSessionsController,
  listFacultySessionsController,
  getSessionController,
  getLiveSessionController,
  closeSessionController,
  reopenSessionController,
  extendSessionController,
} from '../controllers/session.controller'

const router = Router()
const lecturerOnly = requireRole('lecturer')

// Lecturer manages own sessions
router.post('/',    authenticate, lecturerOnly, openSessionController)
router.get('/',     authenticate, lecturerOnly, listSessionsController)

// Faculty Admin: list all sessions within their faculty
router.get('/faculty', authenticate, requireRole('faculty_admin'), listFacultySessionsController)

// Any staff can fetch a single session (service enforces faculty/assignment scope)
router.get('/:sessionId',        authenticate, getSessionController)
router.get('/:sessionId/live',   authenticate, lecturerOnly, getLiveSessionController)
router.patch('/:sessionId/close',   authenticate, lecturerOnly, closeSessionController)
router.patch('/:sessionId/reopen',  authenticate, lecturerOnly, reopenSessionController)
router.patch('/:sessionId/extend',  authenticate, lecturerOnly, extendSessionController)

export default router
