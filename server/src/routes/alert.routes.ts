import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { requireRole } from '../middleware/role'
import { listAlertsController } from '../controllers/alert.controller'

const router = Router()

router.get('/', authenticate, requireRole('student', 'lecturer', 'faculty_admin'), listAlertsController)

export default router
