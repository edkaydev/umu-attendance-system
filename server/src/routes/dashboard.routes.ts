import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import {
  studentDashboardController,
  lecturerDashboardController,
  facultyAdminDashboardController,
  systemAdminDashboardController,
} from '../controllers/dashboard.controller'

const router = Router()

router.get('/student', authenticate, requireRole('student'), studentDashboardController)
router.get('/lecturer', authenticate, requireRole('lecturer'), lecturerDashboardController)
router.get('/faculty-admin', authenticate, requireRole('faculty_admin'), facultyAdminDashboardController)
router.get('/system-admin', authenticate, requireRole('system_admin'), systemAdminDashboardController)

export default router
