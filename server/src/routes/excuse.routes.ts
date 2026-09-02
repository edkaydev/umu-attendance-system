import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import {
  submitExcuseController,
  approveExcuseController,
  rejectExcuseController,
} from '../controllers/excuse.controller'

const router = Router()

// Student: submit an excuse request
router.post('/', authenticate, requireRole('student'), submitExcuseController)

// Lecturer: approve or reject an excuse request
router.patch('/:excuseId/approve', authenticate, requireRole('lecturer'), approveExcuseController)
router.patch('/:excuseId/reject', authenticate, requireRole('lecturer'), rejectExcuseController)

export default router
